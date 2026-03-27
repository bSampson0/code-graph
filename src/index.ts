import fg from "fast-glob";
import { execSync } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseJavaFile } from "./parser.js";
import { parseJsFile } from "./parser-js.js";
import { GraphDB } from "./graph.js";
import { summarizeCodebase } from "./llm.js";

type ProjectType = "java" | "node";

function detectProjectType(dir: string): ProjectType {
  // Prefer Node if there's a package.json at root
  if (existsSync(join(dir, "package.json"))) return "node";
  return "java";
}

async function run() {

  const repoUrl = process.argv[2];

  if (!repoUrl) {
    console.error("Usage: npm start <github-repo-url>");
    console.error("  e.g. npm start https://github.com/owner/repo");
    process.exit(1);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "java-code-graph-"));
  console.log(`Cloning ${repoUrl}...`);
  execSync(`git clone --depth 1 "${repoUrl}" "${tmpDir}"`, { stdio: "inherit" });

  try {

    const graph = new GraphDB();
    const projectType = detectProjectType(tmpDir);
    console.log(`Detected project type: ${projectType}`);

    let files: string[];

    if (projectType === "node") {
      files = await fg("**/*.{js,ts,mjs,cjs}", {
        cwd: tmpDir,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.d.ts", "**/*.test.*", "**/*.spec.*"],
      });
    } else {
      files = await fg("**/*.java", { cwd: tmpDir });
    }

    console.log(`Found ${files.length} ${projectType === "node" ? "JS/TS" : "Java"} file(s).`);

    for (const file of files) {

      console.log("Parsing:", file);

      const parsed = projectType === "node"
        ? parseJsFile(join(tmpDir, file))
        : parseJavaFile(join(tmpDir, file));

      for (const method of parsed) {

        await graph.createClass(method.className);
        await graph.createMethod(method.methodName);
        await graph.linkClassMethod(
          method.className,
          method.methodName
        );

        for (const call of method.calls) {
          await graph.createMethod(call);
          await graph.linkMethodCall(
            method.methodName,
            call
          );
        }

      }

    }

    const classNames = await graph.getClassNames();
    const methodNames = await graph.getMethodNames();

    console.log(`\nWritten to Neo4j: ${classNames.length} class(es), ${methodNames.length} method(s).`);
    console.log("\nSummarizing codebase with LLM...");
    try {
      const summary = await summarizeCodebase(classNames, methodNames);
      console.log("\n" + summary);
    } catch (err: any) {
      if (err?.cause?.code === "ECONNREFUSED") {
        console.warn("\n[LLM skipped] Ollama is not running. Start it with: ollama serve");
        console.warn(`Then pull a model if needed: ollama pull ${process.env.OLLAMA_MODEL ?? "llama3"}`);
      } else {
        console.warn("\n[LLM skipped]", err?.message ?? err);
      }
    }
    console.log("\nDone! Run \`npm run chat\` to ask questions about the graph.");

  } finally {

    console.log("Cleaning up temporary clone...");
    rmSync(tmpDir, { recursive: true, force: true });

  }

}

run();