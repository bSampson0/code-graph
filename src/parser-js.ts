import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import treeSitterTypeScript from "tree-sitter-typescript";
const { typescript, tsx } = treeSitterTypeScript;
import fs from "fs";
import path from "path";

import type { ParsedMethod } from "./parser.js";

export type { ParsedMethod };

const jsParser = new Parser();
jsParser.setLanguage(JavaScript);

const tsParser = new Parser();
tsParser.setLanguage(typescript);

const tsxParser = new Parser();
tsxParser.setLanguage(tsx);

function parserFor(filePath: string): Parser {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts") return tsParser;
  if (ext === ".tsx") return tsxParser;
  return jsParser;
}

/** Collect all call expression names reachable from a node */
function collectCalls(node: any): string[] {
  const calls: string[] = [];
  function walk(n: any) {
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      if (fn) {
        // foo() → fn.type = "identifier"
        // obj.foo() → fn.type = "member_expression", field "property"
        if (fn.type === "identifier") {
          calls.push(fn.text);
        } else if (fn.type === "member_expression") {
          const prop = fn.childForFieldName("property");
          if (prop) calls.push(prop.text);
        }
      }
    }
    for (const child of n.namedChildren) walk(child);
  }
  walk(node);
  return calls;
}

export function parseJsFile(filePath: string): ParsedMethod[] {
  const code = fs.readFileSync(filePath, "utf8");
  const p = parserFor(filePath);
  const tree = p.parse(code);
  const results: ParsedMethod[] = [];

  // Virtual class name for top-level functions = filename without extension
  const moduleClass = path.basename(filePath, path.extname(filePath));

  function walk(node: any, className?: string) {
    // ── class declaration ────────────────────────────────────────────────────
    if (node.type === "class_declaration" || node.type === "class") {
      const nameNode = node.childForFieldName("name");
      const newClass = nameNode?.text ?? moduleClass;
      for (const child of node.namedChildren) walk(child, newClass);
      return;
    }

    // ── class method ─────────────────────────────────────────────────────────
    if (node.type === "method_definition") {
      const nameNode = node.childForFieldName("name");
      const methodName = nameNode?.text;
      if (methodName && className) {
        results.push({
          className,
          methodName,
          calls: collectCalls(node),
        });
      }
      return; // don't recurse into method body for class detection
    }

    // ── top-level / nested function declaration ───────────────────────────────
    if (node.type === "function_declaration" || node.type === "function") {
      const nameNode = node.childForFieldName("name");
      const methodName = nameNode?.text;
      if (methodName) {
        results.push({
          className: className ?? moduleClass,
          methodName,
          calls: collectCalls(node),
        });
      }
      for (const child of node.namedChildren) walk(child, className);
      return;
    }

    // ── const foo = () => {} / const foo = function() {} ─────────────────────
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName("name");
      const valueNode = node.childForFieldName("value");
      if (
        nameNode &&
        valueNode &&
        (valueNode.type === "arrow_function" || valueNode.type === "function")
      ) {
        results.push({
          className: className ?? moduleClass,
          methodName: nameNode.text,
          calls: collectCalls(valueNode),
        });
        return;
      }
    }

    // ── export default function ───────────────────────────────────────────────
    if (node.type === "export_statement") {
      const decl = node.namedChildren.find(
        (c: any) =>
          c.type === "function_declaration" || c.type === "class_declaration"
      );
      if (decl) {
        walk(decl, className);
        return;
      }
    }

    for (const child of node.namedChildren) walk(child, className);
  }

  walk(tree.rootNode);
  return results;
}
