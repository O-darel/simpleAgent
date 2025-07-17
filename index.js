import express from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";
import axios from "axios";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Email transport configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Tool: Send Email
async function sendEmail(to, subject, text) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    };
    await transporter.sendMail(mailOptions);
    return `Email sent successfully to ${to}`;
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// Tool: Web Search
async function webSearch(query) {
  try {
    const response = await axios.get("https://serpapi.com/search", {
      params: {
        q: query,
        api_key: process.env.SERPAPI_KEY,
      },
    });
    const results = response.data.organic_results
      ?.slice(0, 3)
      .map((result) => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet,
      }));
    return JSON.stringify(results || []);
  } catch (error) {
    throw new Error(`Web search failed: ${error.message}`);
  }
}

// Tool: Weather Lookup
async function getWeather(city) {
  try {
    const response = await axios.get(
      "https://api.openweathermap.org/data/2.5/weather",
      {
        params: {
          q: city,
          appid: process.env.OPENWEATHER_API_KEY,
          units: "metric",
        },
      }
    );
    const { main, weather } = response.data;
    return `Weather in ${city}: ${weather[0].description}, Temperature: ${main.temp}°C, Humidity: ${main.humidity}%`;
  } catch (error) {
    throw new Error(`Weather lookup failed: ${error.message}`);
  }
}

// Agentic endpoint
app.post("/agent", async (req, res) => {
  try {
    const { prompt, tool } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    let response;

    // Route to appropriate tool
    switch (tool?.toLowerCase()) {
      case "email": {
        const { to, subject, text } = prompt;
        if (!to || !subject || !text) {
          return res
            .status(400)
            .json({ error: "Email requires to, subject, and text" });
        }
        response = await sendEmail(to, subject, text);
        break;
      }
      case "websearch": {
        response = await webSearch(prompt);
        break;
      }
      case "weather": {
        response = await getWeather(prompt);
        break;
      }
      default: {
        // Default to Gemini for general queries
        const result = await model.generateContent(prompt);
        response = (await result.response).text();
      }
    }

    res.json({ response });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Agentic server with tools is running" });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
