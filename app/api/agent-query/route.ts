import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator, OrchestrationResult, StreamOrchestrationCallbacks, DelegationAgent } from '../../../orchestrator';
import { ResearchAgent } from '../../../agents/ResearchAgent';
import { ReportAgent } from '../../../agents/ReportAgent';
import { TriageAgent, TaskType, TriageResult } from '../../../agents/TriageAgent';
import { AgentResponse, StreamCallbacks } from '../../../agents/agent';
import { RunConfig } from '../../../agents/tracing';

// Simple in-memory rate limiting (would be replaced with Redis or similar in production)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
const ipRequests = new Map<string, { count: number, resetTime: number }>();

// Add heartbeat interval and timeout constants
const HEARTBEAT_INTERVAL = 15000; // 15 seconds
const REQUEST_TIMEOUT = 60000; // 1 minute

function rateLimitCheck(ip: string): { allowed: boolean, message?: string } {
  const now = Date.now();
  const record = ipRequests.get(ip);
  
  if (!record || now > record.resetTime) {
    // First request or reset window
    ipRequests.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }
  
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    // Too many requests
    const timeToReset = Math.ceil((record.resetTime - now) / 1000);
    return { 
      allowed: false, 
      message: `Rate limit exceeded. Try again in ${timeToReset} seconds.`
    };
  }
  
  // Increment counter for this window
  record.count += 1;
  ipRequests.set(ip, record);
  return { allowed: true };
}

export async function POST(req: NextRequest) {
  try {
    // Basic rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = rateLimitCheck(ip);
    
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.message },
        { status: 429 }
      );
    }
    
    // Parse request body
    const body = await req.json();
    const { 
      query, 
      agentType = 'auto', 
      stream = false,
      workflow_name,
      group_id,
      tracing_disabled,
      trace_include_sensitive_data,
      metadata 
    } = body;
    
    // Create run config for tracing
    const runConfig: RunConfig = {
      workflow_name: workflow_name || `API Request - ${agentType}`,
      group_id,
      tracing_disabled,
      trace_include_sensitive_data,
      metadata
    };
    
    // Validate request
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }
    
    // If streaming is requested, handle it differently
    if (stream) {
      return handleStreamingResponse(query, agentType, runConfig);
    }
    
    // Non-streaming response handling
    // Record start time for performance tracking
    const startTime = Date.now();
    let result: { success: boolean; content?: string; report?: string; error?: string; metadata?: any };
    
    // Route to the appropriate agent based on the agentType
    switch (agentType) {
      case 'triage':
        // Only perform triage without executing agents
        const triageAgent = new TriageAgent();
        const triageResponse: AgentResponse = await triageAgent.handleTask(query);
        
        if (triageResponse.success) {
          // Parse the triage result
          try {
            const triageResult = JSON.parse(triageResponse.content) as TriageResult;
            result = {
              success: true,
              content: triageResponse.content,
              metadata: {
                ...triageResponse.metadata,
                processingTime: Date.now() - startTime,
                taskType: triageResult.taskType
              }
            };
          } catch (parseError) {
            result = {
              success: false,
              error: 'Failed to parse triage response',
              metadata: {
                parsingError: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
                processingTime: Date.now() - startTime
              }
            };
          }
        } else {
          result = {
            success: false,
            error: triageResponse.error || 'Triage agent failed without specific error',
            metadata: {
              processingTime: Date.now() - startTime
            }
          };
        }
        break;
        
      case 'research':
        // Only perform research
        const researchAgent = new ResearchAgent();
        const researchResponse = await researchAgent.handleTask(query);
        result = {
          success: researchResponse.success,
          content: researchResponse.content,
          error: researchResponse.error,
          metadata: {
            ...researchResponse.metadata,
            processingTime: Date.now() - startTime
          }
        };
        break;
        
      case 'report':
        // Only generate a report
        const reportAgent = new ReportAgent();
        const reportResponse = await reportAgent.handleTask(query);
        result = {
          success: reportResponse.success,
          content: reportResponse.content,
          error: reportResponse.error,
          metadata: {
            ...reportResponse.metadata,
            processingTime: Date.now() - startTime
          }
        };
        break;
        
      case 'delegation':
        // Use the DelegationAgent directly
        const delegationAgent = new DelegationAgent();
        const delegationResponse = await delegationAgent.handleTask(query, {
          originalQuery: query
        });
        result = {
          success: delegationResponse.success,
          content: delegationResponse.content,
          error: delegationResponse.error,
          metadata: {
            ...delegationResponse.metadata,
            processingTime: Date.now() - startTime
          }
        };
        break;
        
      case 'auto':
      default:
        // Use the orchestrator to handle the query with all agents
        const orchestrator = new Orchestrator();
        const orchestrationResult = await orchestrator.handleQuery(query, runConfig);
        result = {
          success: orchestrationResult.success,
          report: orchestrationResult.report,
          error: orchestrationResult.error,
          metadata: {
            ...orchestrationResult.metadata,
            processingTime: Date.now() - startTime
          }
        };
        break;
    }
    
    // Return the result
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * Handle streaming response for real-time agent output
 */
function handleStreamingResponse(query: string, agentType: string, runConfig?: RunConfig): Response {
  // Create a readable stream from a ReadableStream
  const stream = new ReadableStream({
    async start(controller) {
      // Setup heartbeat and timeout tracking
      let heartbeatIntervalId: NodeJS.Timeout | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      
      try {
        // Set up and encode the initial response
        sendEventMessage(controller, { 
          event: 'start', 
          data: { message: 'Stream started' }
        });
        
        // Set up heartbeat to prevent connection timeouts
        heartbeatIntervalId = setInterval(() => {
          sendEventMessage(controller, {
            event: 'heartbeat',
            data: { timestamp: Date.now() }
          });
        }, HEARTBEAT_INTERVAL);
        
        // Set request timeout
        timeoutId = setTimeout(() => {
          if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
          sendEventMessage(controller, {
            event: 'error',
            data: { message: 'Request timed out' }
          });
          controller.close();
        }, REQUEST_TIMEOUT);
        
        // Shared error handler
        const handleError = (error: Error) => {
          if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
          if (timeoutId) clearTimeout(timeoutId);
          
          console.error(`Stream error in ${agentType}:`, error);
          sendEventMessage(controller, { 
            event: 'error', 
            data: { message: error.message } 
          });
          controller.close();
        };
        
        // Shared token handler to send event to client
        const handleToken = (token: string) => {
          // Ensure token is not undefined or null before sending
          if (token !== undefined && token !== null) {
            sendEventMessage(controller, {
              event: 'token',
              data: { token }
            });
          } else {
            console.warn('Attempted to send undefined/null token, skipping');
          }
        };
        
        // Shared completion handler
        const handleComplete = (response: AgentResponse) => {
          if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
          if (timeoutId) clearTimeout(timeoutId);
          
          // Send a trace event with the spans
          if (response.metadata?.trace_id) {
            // Get trace information from the metadata
            sendEventMessage(controller, {
              event: 'trace',
              data: {
                trace_id: response.metadata.trace_id,
                // In a real implementation, this would include the actual spans from the trace
                spans: response.metadata.spans || []
              }
            });
          }
          
          sendEventMessage(controller, {
            event: 'complete',
            data: {
              success: response.success,
              content: response.content,
              metadata: response.metadata
            }
          });
          controller.close();
        };
        
        // Route to the appropriate agent based on the agentType
        switch (agentType) {
          case 'triage': {
            const triageAgent = new TriageAgent();
            if (!triageAgent.streamTask) {
              // Triage doesn't support streaming, so fake it with regular task execution
              try {
                sendEventMessage(controller, {
                  event: 'agent_start',
                  data: { agent: 'triage' }
                });
                
                const response = await triageAgent.handleTask(query);
                if (response.success) {
                  try {
                    const triageResult = JSON.parse(response.content) as TriageResult;
                    handleToken(`Analyzed your query. This appears to be a ${triageResult.taskType} task.\n\n`);
                    handleToken(`Reasoning: ${triageResult.reasoning}\n\n`);
                    
                    if (triageResult.modifiedQuery && triageResult.modifiedQuery !== query) {
                      handleToken(`Suggested query reformulation: ${triageResult.modifiedQuery}\n\n`);
                    }
                  } catch (parseError) {
                    handleToken('Analysis complete, but could not parse the result format.\n\n');
                  }
                }
                handleComplete(response);
              } catch (error) {
                handleError(error instanceof Error ? error : new Error('Triage processing failed'));
              }
              return;
            }
            
            // If triage agent implements streamTask in the future, this code would run
            await triageAgent.streamTask(
              query,
              {
                onStart: () => {
                  sendEventMessage(controller, {
                    event: 'agent_start',
                    data: { agent: 'triage' }
                  });
                },
                onToken: handleToken,
                onError: handleError,
                onComplete: handleComplete
              }
            );
            break;
          }
          
          case 'research': {
            const researchAgent = new ResearchAgent();
            if (!researchAgent.streamTask) {
              handleError(new Error('Research agent does not support streaming'));
              return;
            }
            
            await researchAgent.streamTask(
              query,
              {
                onStart: () => {
                  sendEventMessage(controller, {
                    event: 'agent_start',
                    data: { agent: 'research' }
                  });
                },
                onToken: handleToken,
                onError: handleError,
                onComplete: handleComplete
              }
            );
            break;
          }
            
          case 'report': {
            const reportAgent = new ReportAgent();
            if (!reportAgent.streamTask) {
              handleError(new Error('Report agent does not support streaming'));
              return;
            }
            
            await reportAgent.streamTask(
              query,
              {
                onStart: () => {
                  sendEventMessage(controller, {
                    event: 'agent_start',
                    data: { agent: 'report' }
                  });
                },
                onToken: handleToken,
                onError: handleError,
                onComplete: handleComplete
              }
            );
            break;
          }
            
          case 'delegation': {
            const delegationAgent = new DelegationAgent();
            if (!delegationAgent.streamTask) {
              handleError(new Error('Delegation agent does not support streaming'));
              return;
            }
            
            await delegationAgent.streamTask(
              query,
              {
                onStart: () => {
                  sendEventMessage(controller, {
                    event: 'agent_start',
                    data: { agent: 'delegation' }
                  });
                },
                onToken: handleToken,
                onError: handleError,
                onComplete: handleComplete,
                onHandoff: (from, to) => {
                  sendEventMessage(controller, {
                    event: 'handoff',
                    data: { from, to, timestamp: Date.now() }
                  });
                }
              },
              { originalQuery: query }
            );
            break;
          }
            
          case 'auto':
          default:
            // Use the full orchestration process with streaming
            const orchestrator = new Orchestrator();
            
            await orchestrator.streamQuery(query, {
              onStart: () => {
                // Send notification that processing has started
                sendEventMessage(controller, {
                  event: 'start',
                  data: { timestamp: Date.now() }
                });
                
                // Start sending heartbeats
                heartbeatIntervalId = setInterval(() => {
                  sendEventMessage(controller, {
                    event: 'heartbeat',
                    data: { timestamp: Date.now() }
                  });
                }, HEARTBEAT_INTERVAL);
                
                // Set timeout
                timeoutId = setTimeout(() => {
                  if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
                  handleError(new Error('Request timed out after ' + (REQUEST_TIMEOUT / 1000) + ' seconds'));
                }, REQUEST_TIMEOUT);
              },
              onToken: handleToken,
              onComplete: handleComplete,
              onError: handleError,
              onTriageComplete: (result) => {
                sendEventMessage(controller, {
                  event: 'triage',
                  data: result
                });
              },
              onResearchStart: () => {
                sendEventMessage(controller, {
                  event: 'research_start',
                  data: { timestamp: Date.now() }
                });
              },
              onResearchComplete: (researchData) => {
                sendEventMessage(controller, {
                  event: 'research_complete',
                  data: { 
                    timestamp: Date.now(),
                    citations: orchestrator.countCitations(researchData) 
                  }
                });
              },
              onReportStart: () => {
                sendEventMessage(controller, {
                  event: 'report_start',
                  data: { timestamp: Date.now() }
                });
              },
              onHandoff: (from, to) => {
                sendEventMessage(controller, {
                  event: 'handoff',
                  data: {
                    from,
                    to,
                    timestamp: Date.now()
                  }
                });
              }
            }, runConfig);
            break;
        }
      } catch (error) {
        console.error('Stream setup error:', error);
        sendEventMessage(controller, { 
          event: 'error', 
          data: { message: error instanceof Error ? error.message : 'Unknown stream error' } 
        });
        controller.close();
      }
    }
  });
  
  // Return the stream as a server-sent events response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

/**
 * Send an SSE-formatted message through the controller
 */
function sendEventMessage(
  controller: ReadableStreamDefaultController,
  { event, data }: { event: string; data: any }
): void {
  // Format as SSE
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  // Send to client
  controller.enqueue(new TextEncoder().encode(message));
} 