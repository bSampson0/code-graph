import Parser from "tree-sitter";
import Java from "tree-sitter-java";
import fs from "fs";

const parser = new Parser();
parser.setLanguage(Java);

export interface ParsedParameter {
  name: string;
  type: string;
}

export interface ParsedField {
  name: string;
  type: string;
  modifiers: string[];
  annotations: string[];
}

export interface ParsedClass {
  name: string;
  kind: "class" | "interface" | "abstract";
  modifiers: string[];
  annotations: string[];
  superClass: string | undefined;
  interfaces: string[];
  fields: ParsedField[];
}

export interface ParsedMethod {
  className: string;
  methodName: string;
  returnType: string;
  params: ParsedParameter[];
  modifiers: string[];
  annotations: string[];
  throws: string[];
  calls: string[];
}

export interface ParsedFile {
  classes: ParsedClass[];
  methods: ParsedMethod[];
  imports: string[];
}

const MODIFIER_KEYWORDS = new Set([
  "public", "private", "protected", "static", "final",
  "abstract", "synchronized", "volatile", "transient", "native", "strictfp",
]);

function extractModifiersAndAnnotations(node: any): { modifiers: string[]; annotations: string[] } {
  const modifiers: string[] = [];
  const annotations: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "modifiers") {
      for (const mod of child.namedChildren) {
        if (mod.type === "annotation" || mod.type === "marker_annotation") {
          const n = mod.childForFieldName("name");
          if (n) annotations.push(n.text);
        } else if (MODIFIER_KEYWORDS.has(mod.type)) {
          modifiers.push(mod.type);
        }
      }
    }
  }
  return { modifiers, annotations };
}

function collectJavaCalls(node: any): string[] {
  const calls: string[] = [];
  function walk(n: any) {
    if (n.type === "method_invocation") {
      const name = n.childForFieldName("name");
      if (name) calls.push(name.text);
    }
    for (const child of n.namedChildren) walk(child);
  }
  walk(node);
  return calls;
}

function extractSuperClass(node: any): string | undefined {
  for (const child of node.namedChildren) {
    if (child.type === "superclass") return child.namedChildren[0]?.text;
  }
  return undefined;
}

function extractInterfaces(node: any): string[] {
  const results: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "super_interfaces") {
      function collect(n: any) {
        if (n.type === "type_identifier") results.push(n.text);
        for (const c of n.namedChildren) collect(c);
      }
      collect(child);
    }
  }
  return results;
}

function extractFields(bodyNode: any): ParsedField[] {
  const fields: ParsedField[] = [];
  if (!bodyNode) return fields;
  for (const member of bodyNode.namedChildren) {
    if (member.type === "field_declaration") {
      const { modifiers, annotations } = extractModifiersAndAnnotations(member);
      const fieldType = member.childForFieldName("type")?.text ?? "unknown";
      for (const child of member.namedChildren) {
        if (child.type === "variable_declarator") {
          const name = child.childForFieldName("name")?.text;
          if (name) fields.push({ name, type: fieldType, modifiers, annotations });
        }
      }
    }
  }
  return fields;
}

export function parseJavaFile(filePath: string): ParsedFile {
  const code = fs.readFileSync(filePath, "utf8");
  const tree = parser.parse(code);
  const classes: ParsedClass[] = [];
  const methods: ParsedMethod[] = [];
  const imports: string[] = [];

  function walk(node: any, currentClass?: string) {

    if (node.type === "import_declaration") {
      const raw = node.text.replace(/^import\s+(static\s+)?/, "").replace(/;$/, "").trim();
      imports.push(raw);
      return;
    }

    if (node.type === "interface_declaration") {
      const name = node.childForFieldName("name")?.text ?? "Unknown";
      const { modifiers, annotations } = extractModifiersAndAnnotations(node);
      const body = node.childForFieldName("body");
      classes.push({ name, kind: "interface", modifiers, annotations, superClass: undefined, interfaces: [], fields: extractFields(body) });
      for (const child of node.namedChildren) walk(child, name);
      return;
    }

    if (node.type === "class_declaration") {
      const name = node.childForFieldName("name")?.text ?? "Unknown";
      const { modifiers, annotations } = extractModifiersAndAnnotations(node);
      const superClass = extractSuperClass(node);
      const interfaces = extractInterfaces(node);
      const body = node.childForFieldName("body");
      const fields = extractFields(body);
      classes.push({
        name,
        kind: modifiers.includes("abstract") ? "abstract" : "class",
        modifiers,
        annotations,
        superClass,
        interfaces,
        fields,
      });
      for (const child of node.namedChildren) walk(child, name);
      return;
    }

    if (node.type === "method_declaration") {
      const methodName = node.childForFieldName("name")?.text ?? "unknown";
      const returnType = node.childForFieldName("type")?.text ?? "void";
      const { modifiers, annotations } = extractModifiersAndAnnotations(node);

      const params: ParsedParameter[] = [];
      const paramList = node.childForFieldName("parameters");
      if (paramList) {
        for (const p of paramList.namedChildren) {
          if (p.type === "formal_parameter" || p.type === "spread_parameter") {
            params.push({
              name: p.childForFieldName("name")?.text ?? "param",
              type: p.childForFieldName("type")?.text ?? "unknown",
            });
          }
        }
      }

      const throws_: string[] = [];
      for (const child of node.namedChildren) {
        if (child.type === "throws") {
          for (const exc of child.namedChildren) {
            const t = exc.text.trim();
            if (t && t !== ",") throws_.push(t);
          }
        }
      }

      if (currentClass) {
        methods.push({
          className: currentClass,
          methodName,
          returnType,
          params,
          modifiers,
          annotations,
          throws: throws_,
          calls: collectJavaCalls(node),
        });
      }
      return;
    }

    for (const child of node.namedChildren) walk(child, currentClass);
  }

  walk(tree.rootNode);
  return { classes, methods, imports };
}
