import Ollama from "ollama";

const MODEL = process.env.OLLAMA_MODEL ?? "llama3";

const SCHEMA = `
Neo4j graph schema:
- (:Class {name: string})  — a Java class
- (:Method {name: string}) — a Java method
- (:Class)-[:DECLARES]->(:Method)  — a class declares a method
- (:Method)-[:CALLS]->(:Method)    — a method calls another method
`.trim();

export async function generateCypher(question: string): Promise<string> {
  const response = await Ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          `You are a Neo4j Cypher expert. Given the schema below and a natural language question, ` +
          `output ONLY a valid Cypher query — no explanation, no markdown, no code fences.\n\n${SCHEMA}`,
      },
      { role: "user", content: question },
    ],
  });

  // Strip accidental code fences the model may still emit
  return response.message.content
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .trim();
}

export async function summarizeCodebase(
  classes: string[],
  methods: string[]
): Promise<string> {
  const response = await Ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a software engineer. Given the module/class names and function/method names from a code repository, " +
          "write a concise (3-5 sentence) summary of what the codebase likely does.",
      },
      {
        role: "user",
        content: `Modules/Classes: ${classes.join(", ")}\nFunctions/Methods: ${methods.join(", ")}`,
      },
    ],
  });
  return response.message.content.trim();
}

export async function explainSymbol(
  name: string,
  type: "class" | "method",
  relationships: string[]
): Promise<string> {
  const response = await Ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a software engineer explaining Java code. " +
          "Given a symbol name and its graph relationships, explain what it likely does in 2-4 sentences.",
      },
      {
        role: "user",
        content:
          `${type === "class" ? "Class" : "Method"}: "${name}"\n` +
          `Relationships:\n${relationships.length ? relationships.join("\n") : "(none)"}`,
      },
    ],
  });
  return response.message.content.trim();
}
