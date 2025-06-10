//evals.ts

import { EvalConfig } from 'mcp-evals';
import { openai } from "@ai-sdk/openai";
import { grade, EvalFunction } from "mcp-evals";

const get_transcriptEval: EvalFunction = {
    name: "get_transcript Tool Evaluation",
    description: "Evaluates the extraction of transcripts from YouTube video URLs or IDs",
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please extract the English transcript from the YouTube video with ID dQw4w9WgXcQ.");
        return JSON.parse(result);
    }
};

const config: EvalConfig = {
    model: openai("gpt-4"),
    evals: [get_transcriptEval]
};
  
export default config;
  
export const evals = [get_transcriptEval];