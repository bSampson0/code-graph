import Parser from "tree-sitter";
import Java from "tree-sitter-java";
import fs from "fs";

const parser = new Parser();
parser.setLanguage(Java);

export interface ParsedMethod {
  className: string;
  methodName: string;
  calls: string[];
}

export function parseJavaFile(path: string): ParsedMethod[] {

  const code = fs.readFileSync(path, "utf8");
  const tree = parser.parse(code);

  const results: ParsedMethod[] = [];

  function walk(node: any, className?: string) {

    if (node.type === "class_declaration") {

      const nameNode = node.childForFieldName("name");
      className = nameNode.text;
    }

    if (node.type === "method_declaration") {

      const methodNode = node.childForFieldName("name");
      const methodName = methodNode.text;

      const calls: string[] = [];

      node.walk().currentNode.descendantsOfType?.("method_invocation")?.forEach(
        (call: any) => {
          const name = call.childForFieldName("name")?.text;
          if (name) calls.push(name);
        }
      );

      results.push({
        className: className!,
        methodName,
        calls
      });
    }

    for (const child of node.namedChildren) {
      walk(child, className);
    }

  }

  walk(tree.rootNode);

  return results;
}