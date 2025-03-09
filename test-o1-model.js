const OpenAI = require("openai");

// Initialize the OpenAI client with API key from environment
const openai = new OpenAI.OpenAI();

async function testO1Model() {
  const prompt = `
  Write a bash script that takes a matrix represented as a string with 
  format '[1,2],[3,4],[5,6]' and prints the transpose in the same format.
  `;
   
  try {
    const completion = await openai.chat.completions.create({
      model: "o1",
      reasoning_effort: "medium",
      messages: [
        {
          role: "user", 
          content: prompt
        }
      ],
      store: true,
    });
  
    console.log(completion.choices[0].message.content);
    console.log("API call successful!");
  } catch (error) {
    console.error("API call failed:", error);
    console.error("Error details:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

testO1Model(); 