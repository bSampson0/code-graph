import neo4j from "neo4j-driver";

export class GraphDB {

  driver = neo4j.driver(
    // replace with your Neo4j connection details
    "neo4j://127.0.0.1:7687",
    neo4j.auth.basic("neo4j", "redhot1943")
  );

  async createClass(name: string, props: { kind?: string; modifiers?: string[]; annotations?: string[] } = {}) {
    const session = this.driver.session();
    await session.run(
      `MERGE (c:Class {name:$name})
       SET c.kind = $kind, c.modifiers = $modifiers, c.annotations = $annotations`,
      { name, kind: props.kind ?? "class", modifiers: props.modifiers ?? [], annotations: props.annotations ?? [] }
    );
    await session.close();
  }

  async createMethod(name: string, props: { returnType?: string; params?: string[]; modifiers?: string[]; annotations?: string[] } = {}) {
    const session = this.driver.session();
    await session.run(
      `MERGE (m:Method {name:$name})
       SET m.returnType = $returnType, m.params = $params, m.modifiers = $modifiers, m.annotations = $annotations`,
      {
        name,
        returnType: props.returnType ?? "void",
        params: props.params ?? [],
        modifiers: props.modifiers ?? [],
        annotations: props.annotations ?? [],
      }
    );
    await session.close();
  }

  async createField(name: string, type: string, modifiers: string[] = []) {
    const session = this.driver.session();
    await session.run(
      `MERGE (f:Field {name:$name, type:$type}) SET f.modifiers = $modifiers`,
      { name, type, modifiers }
    );
    await session.close();
  }

  async createException(name: string) {
    const session = this.driver.session();
    await session.run(`MERGE (e:Exception {name:$name})`, { name });
    await session.close();
  }

  async createModule(name: string) {
    const session = this.driver.session();
    await session.run(`MERGE (m:Module {name:$name})`, { name });
    await session.close();
  }

  async linkClassMethod(className: string, methodName: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (c:Class {name:$class})
       MATCH (m:Method {name:$method})
       MERGE (c)-[:DECLARES]->(m)`,
      { class: className, method: methodName }
    );
    await session.close();
  }

  async linkMethodCall(caller: string, callee: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (m1:Method {name:$caller})
       MATCH (m2:Method {name:$callee})
       MERGE (m1)-[:CALLS]->(m2)`,
      { caller, callee }
    );
    await session.close();
  }

  async linkClassExtends(child: string, parent: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (c:Class {name:$child})
       MATCH (p:Class {name:$parent})
       MERGE (c)-[:EXTENDS]->(p)`,
      { child, parent }
    );
    await session.close();
  }

  async linkClassImplements(className: string, interfaceName: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (c:Class {name:$class})
       MATCH (i:Class {name:$iface})
       MERGE (c)-[:IMPLEMENTS]->(i)`,
      { class: className, iface: interfaceName }
    );
    await session.close();
  }

  async linkClassField(className: string, fieldName: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (c:Class {name:$class})
       MATCH (f:Field {name:$field})
       MERGE (c)-[:HAS_FIELD]->(f)`,
      { class: className, field: fieldName }
    );
    await session.close();
  }

  async linkMethodThrows(methodName: string, exceptionName: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (m:Method {name:$method})
       MATCH (e:Exception {name:$exc})
       MERGE (m)-[:THROWS]->(e)`,
      { method: methodName, exc: exceptionName }
    );
    await session.close();
  }

  async linkClassImports(className: string, moduleName: string) {
    const session = this.driver.session();
    await session.run(
      `MATCH (c:Class {name:$class})
       MATCH (m:Module {name:$module})
       MERGE (c)-[:IMPORTS]->(m)`,
      { class: className, module: moduleName }
    );
    await session.close();
  }

  async runQuery(cypher: string): Promise<Record<string, any>[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(cypher);
      return result.records.map(r =>
        Object.fromEntries(r.keys.map(k => [k, r.get(k)]))
      );
    } finally {
      await session.close();
    }
  }

  async getClassNames(): Promise<string[]> {
    const rows = await this.runQuery(`MATCH (c:Class) RETURN c.name AS name`);
    return rows.map(r => String(r["name"]));
  }

  async getMethodNames(): Promise<string[]> {
    const rows = await this.runQuery(`MATCH (m:Method) RETURN m.name AS name`);
    return rows.map(r => String(r["name"]));
  }

  async getRelationships(name: string): Promise<string[]> {
    const rows = await this.runQuery(`
      MATCH (a)-[r]->(b)
      WHERE a.name = "${name}" OR b.name = "${name}"
      RETURN a.name AS from, type(r) AS rel, b.name AS to
    `);
    return rows.map(r => `(${r["from"]})-[:${r["rel"]}]->(${r["to"]})`);
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
