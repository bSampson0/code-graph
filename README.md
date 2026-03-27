# code-graph

Parse a GitHub repository (Java or Node.js) and map its classes, functions, and call relationships into a [Neo4j](https://neo4j.com/) graph database. Then chat with the graph in plain English using a local LLM via [Ollama](https://ollama.com/).

---

## Features

- **Auto-detects project type** — Java (`.java`) or Node.js (`.js`, `.ts`, `.mjs`, `.cjs`)
- **Extracts** classes, methods/functions, and call relationships using [tree-sitter](https://tree-sitter.github.io/)
- **Writes** the structure to Neo4j as a queryable graph
- **Summarizes** the codebase with an LLM after parsing
- **Interactive chat REPL** — ask questions in plain English, explain any class or method, or run raw Cypher queries

---

## Requirements

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | v18+ |
| [Neo4j](https://neo4j.com/download/) | 5.x (local or cloud) |
| [Ollama](https://ollama.com/) | Any recent version |
| [Git](https://git-scm.com/) | Any |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/bSampson0/code-graph.git
cd code-graph
npm install
```

### 2. Configure Neo4j

Edit `src/graph.ts` and update the connection details:

```ts
driver = neo4j.driver(
  "neo4j://127.0.0.1:7687",       // your Neo4j bolt URL
  neo4j.auth.basic("neo4j", "your-password")
);
```

Start Neo4j (if running locally):

```bash
# macOS via Homebrew
brew services start neo4j

# or use the Neo4j Desktop app
```

### 3. Set up Ollama (for LLM features)

```bash
# Install Ollama: https://ollama.com/download
ollama serve            # start the local LLM server
ollama pull llama3      # download the default model (one-time)
```

To use a different model:

```bash
OLLAMA_MODEL=llama3.2 npm start <repo-url>
OLLAMA_MODEL=llama3.2 npm run chat
```

---

## Usage

### Parse a repository

```bash
npm start <github-repo-url>

# Examples
npm start https://github.com/AshleyRayMaceli/pokedex
npm start https://github.com/expressjs/express
```

Or use the shell script:

```bash
./run.sh https://github.com/owner/repo
```

This will:
1. Clone the repo into a temporary directory
2. Detect whether it's a Java or Node.js project
3. Parse all source files and write the graph to Neo4j
4. Print a count of nodes written
5. Ask the LLM to summarize the codebase (requires Ollama)
6. Clean up the temporary clone

**Example output:**
```
Cloning https://github.com/AshleyRayMaceli/pokedex...
Detected project type: java
Found 11 Java file(s).
Parsing: src/main/java/App.java
...
Written to Neo4j: 10 class(es), 104 method(s).

Summarizing codebase with LLM...

This is a Pokémon web application built with Java and Spark...

Done! Run `npm run chat` to ask questions about the graph.
```

---

### Chat with the graph

```bash
npm run chat
```

#### Available commands

| Command | Description |
|---------|-------------|
| `ask <question>` | Ask in plain English — LLM generates Cypher, results are returned |
| `explain class <name>` | LLM explains what a class likely does based on its graph relationships |
| `explain method <name>` | LLM explains what a method likely does |
| `cypher <query>` | Run a raw Cypher query directly against Neo4j |
| `help` | Show command list |
| `quit` | Exit |

#### Example session

```
> ask which classes declare the most methods?
Cypher: MATCH (c:Class)-[:DECLARES]->(m:Method) RETURN c.name, count(m) AS method_count ORDER BY method_count DESC

{"c.name":"Pokemon","method_count":{"low":22,"high":0}}
{"c.name":"DB","method_count":{"low":18,"high":0}}

> explain class Pokemon
The Pokemon class appears to be a model entity that stores and exposes
properties of individual Pokémon — it declares 22 methods, most of which
are likely getters/setters for attributes like name, type, and stats.

> explain method save
The save method is declared in the DB class and calls methods such as
connect and execute, suggesting it persists a record to a database.

> cypher MATCH (m1:Method)-[:CALLS]->(m2:Method) RETURN m1.name, m2.name LIMIT 10
```

---

## Graph Schema

```
(:Class  { name: string })
(:Method { name: string })

(:Class)-[:DECLARES]->(:Method)   // a class declares a method
(:Method)-[:CALLS]->(:Method)     // a method calls another method
```

### Useful Cypher queries

```cypher
// All classes
MATCH (c:Class) RETURN c.name

// All methods in a class
MATCH (c:Class {name:"Pokemon"})-[:DECLARES]->(m) RETURN m.name

// What does a method call?
MATCH (m:Method {name:"save"})-[:CALLS]->(called) RETURN called.name

// Who calls a method?
MATCH (caller:Method)-[:CALLS]->(m:Method {name:"save"}) RETURN caller.name

// Most-called methods
MATCH ()-[:CALLS]->(m:Method) RETURN m.name, count(*) AS calls ORDER BY calls DESC LIMIT 10
```

---

## Project Structure

```
src/
  index.ts        — CLI entry point: clone, detect, parse, write to Neo4j
  parser.ts       — Java parser (tree-sitter-java)
  parser-js.ts    — JS/TS parser (tree-sitter-javascript + tree-sitter-typescript)
  graph.ts        — Neo4j driver wrapper (GraphDB class)
  llm.ts          — Ollama wrapper (generateCypher, summarizeCodebase, explainSymbol)
  chat.ts         — Interactive REPL
run.sh            — Shell script wrapper for npm start
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_MODEL` | `llama3` | Ollama model to use for all LLM calls |

---

## License

ISC
