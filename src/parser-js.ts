import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import treeSitterTypeScript from "tree-sitter-typescript";
const { typescript, tsx } = treeSitterTypeScript;
import fs from "fs";
import path from "path";

import type { ParsedParameter, ParsedField, ParsedClass, ParsedMethod, ParsedFile } from "./parser.js";
export type { ParsedParameter, ParsedField, ParsedClass, ParsedMethod, ParsedFile };

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

function collectJsCalls(node: any): string[] {
  const calls: string[] = [];
  function walk(n: any) {
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      if (fn) {
        if (fn.type === "identifier") calls.push(fn.text);
        else if (fn.type === "member_expression") {
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

function extractJsParams(paramsNode: any): ParsedParameter[] {
  const params: ParsedParameter[] = [];
  if (!paramsNode) return params;
  for (const p of paramsNode.namedChildren) {
    if (p.type === "required_parameter" || p.type === "optional_parameter") {
      const pattern = p.childForFieldName("pattern");
      const typeAnnotation = p.childForFieldName("type");
      const type = typeAnnotation?.namedChildren[0]?.text ?? "any";
      params.push({ name: pattern?.text ?? p.namedChildren[0]?.text ?? "param", type });
    } else if (p.type === "identifier") {
      params.push({ name: p.text, type: "any" });
    } else if (p.type === "assignment_pattern") {
      params.push({ name: p.namedChildren[0]?.text ?? "param", type: "any" });
    }
  }
  return params;
}

function extractDecorators(node: any): string[] {
  const decorators: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "decorator") {
      const inner = child.namedChildren[0];
      if (!inner) continue;
      if (inner.type === "identifier") decorators.push(inner.text);
      else if (inner.type === "call_expression") {
        const fn = inner.childForFieldName("function");
        if (fn) decorators.push(fn.text);
      }
    }
  }
  return decorators;
}

function extractClassHeritage(node: any): { superClass: string | undefined; interfaces: string[] } {
  let superClass: string | undefined;
  const interfaces: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "class_heritage") {
      for (const heir of child.namedChildren) {
        if (heir.type === "extends_clause") {
          superClass = heir.namedChildren[0]?.text;
        } else if (heir.type === "implements_clause") {
          for (const iface of heir.namedChildren) {
            const t = iface.text.trim();
            if (t && t !== "," && t !== "implements") interfaces.push(t);
          }
        }
      }
    }
  }
  return { superClass, interfaces };
}

function extractClassFields(bodyNode: any): ParsedField[] {
  const fields: ParsedField[] = [];
  if (!bodyNode) return fields;
  for (const member of bodyNode.namedChildren) {
    if (member.type === "public_field_definition" || member.type === "field_definition") {
      const name = member.childForFieldName("name")?.text;
      const typeAnnotation = member.childForFieldName("type");
      const type = typeAnnotation?.namedChildren[0]?.text ?? "any";
      const modifiers: string[] = [];
      const acc = member.childForFieldName("accessibility")?.text;
      if (acc) modifiers.push(acc);
      if (name) fields.push({ name, type, modifiers, annotations: [] });
    }
  }
  return fields;
}

function extractMethodModifiers(node: any): string[] {
  const modifiers: string[] = [];
  const acc = node.childForFieldName("accessibility")?.text;
  if (acc) modifiers.push(acc);
  // look for "static", "async", "readonly" as direct children
  for (const child of node.namedChildren) {
    if (["static", "async", "readonly", "override"].includes(child.type)) modifiers.push(child.type);
  }
  return modifiers;
}

export function parseJsFile(filePath: string): ParsedFile {
  const code = fs.readFileSync(filePath, "utf8");
  const p = parserFor(filePath);
  const tree = p.parse(code);

  const classes: ParsedClass[] = [];
  const methods: ParsedMethod[] = [];
  const imports: string[] = [];
  const moduleClass = path.basename(filePath, path.extname(filePath));

  function walk(node: any, currentClass?: string) {

    // ── imports ──────────────────────────────────────────────────────────────
    if (node.type === "import_statement") {
      const source = node.childForFieldName("source")?.text?.replace(/['"]/g, "");
      if (source) imports.push(source);
      return;
    }
    // require()
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.text === "require") {
        const args = node.childForFieldName("arguments");
        const source = args?.namedChildren[0]?.text?.replace(/['"]/g, "");
        if (source) imports.push(source);
      }
    }

    // ── TypeScript interface ──────────────────────────────────────────────────
    if (node.type === "interface_declaration") {
      const name = node.childForFieldName("name")?.text;
      if (name) {
        const extendsInterfaces: string[] = [];
        for (const child of node.namedChildren) {
          if (child.type === "extends_clause") {
            for (const ext of child.namedChildren) {
              const t = ext.text.trim();
              if (t && t !== "," && t !== "extends") extendsInterfaces.push(t);
            }
          }
        }
        const fields: ParsedField[] = [];
        const body = node.childForFieldName("body");
        if (body) {
          for (const member of body.namedChildren) {
            if (member.type === "property_signature") {
              const fieldName = member.childForFieldName("name")?.text;
              const fieldType = member.childForFieldName("type")?.namedChildren[0]?.text ?? "any";
              if (fieldName) fields.push({ name: fieldName, type: fieldType, modifiers: [], annotations: [] });
            }
            if (member.type === "method_signature") {
              const methodName = member.childForFieldName("name")?.text;
              const returnType = member.childForFieldName("return_type")?.namedChildren[0]?.text ?? "void";
              const params = extractJsParams(member.childForFieldName("parameters"));
              if (methodName) {
                methods.push({ className: name, methodName, returnType, params, modifiers: [], annotations: [], throws: [], calls: [] });
              }
            }
          }
        }
        classes.push({ name, kind: "interface", modifiers: [], annotations: [], superClass: undefined, interfaces: extendsInterfaces, fields });
      }
      return;
    }

    // ── TypeScript type alias ─────────────────────────────────────────────────
    if (node.type === "type_alias_declaration") {
      const name = node.childForFieldName("name")?.text;
      if (name) classes.push({ name, kind: "interface", modifiers: [], annotations: [], superClass: undefined, interfaces: [], fields: [] });
      return;
    }

    // ── class declaration ─────────────────────────────────────────────────────
    if (node.type === "class_declaration" || node.type === "class") {
      const name = node.childForFieldName("name")?.text ?? moduleClass;
      const annotations = extractDecorators(node);
      const { superClass, interfaces } = extractClassHeritage(node);
      const body = node.childForFieldName("body");
      const fields = extractClassFields(body);
      classes.push({ name, kind: "class", modifiers: [], annotations, superClass, interfaces, fields });
      for (const child of node.namedChildren) walk(child, name);
      return;
    }

    // ── class method ─────────────────────────────────────────────────────────
    if (node.type === "method_definition") {
      const methodName = node.childForFieldName("name")?.text;
      if (methodName && currentClass) {
        const returnType = node.childForFieldName("return_type")?.namedChildren[0]?.text ?? "void";
        const params = extractJsParams(node.childForFieldName("parameters"));
        const annotations = extractDecorators(node);
        const modifiers = extractMethodModifiers(node);
        methods.push({ className: currentClass, methodName, returnType, params, modifiers, annotations, throws: [], calls: collectJsCalls(node) });
      }
      return;
    }

    // ── top-level function declaration ────────────────────────────────────────
    if (node.type === "function_declaration") {
      const name = node.childForFieldName("name")?.text;
      if (name) {
        const returnType = node.childForFieldName("return_type")?.namedChildren[0]?.text ?? "void";
        const params = extractJsParams(node.childForFieldName("parameters"));
        methods.push({ className: currentClass ?? moduleClass, methodName: name, returnType, params, modifiers: [], annotations: [], throws: [], calls: collectJsCalls(node) });
        for (const child of node.namedChildren) walk(child, currentClass);
      }
      return;
    }

    // ── const foo = () => {} ──────────────────────────────────────────────────
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName("name");
      const valueNode = node.childForFieldName("value");
      if (nameNode && valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function")) {
        const returnType = valueNode.childForFieldName("return_type")?.namedChildren[0]?.text ?? "void";
        const params = extractJsParams(valueNode.childForFieldName("parameters"));
        methods.push({ className: currentClass ?? moduleClass, methodName: nameNode.text, returnType, params, modifiers: [], annotations: [], throws: [], calls: collectJsCalls(valueNode) });
        return;
      }
    }

    // ── export statement ──────────────────────────────────────────────────────
    if (node.type === "export_statement") {
      for (const child of node.namedChildren) {
        if (["function_declaration", "class_declaration", "interface_declaration", "type_alias_declaration"].includes(child.type)) {
          walk(child, currentClass);
          return;
        }
      }
    }

    for (const child of node.namedChildren) walk(child, currentClass);
  }

  walk(tree.rootNode);
  return { classes, methods, imports };
}
