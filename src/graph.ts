import neo4j from "neo4j-driver";

export class GraphDB {

  driver = neo4j.driver(
    // replace with your Neo4j connection details
    "neo4j://127.0.0.1:7687",
    neo4j.auth.basic("neo4j", "redhot1943")
  );

  async createClass(name: string) {
    const session = this.driver.session();
    await session.run(
      `MERGE (c:Class {name:$name})`,
      { name }
    );
    await session.close();
  }

  async createMethod(name: string) {
    const session = this.driver.session();
    await session.run(
      `MERGE (m:Method {name:$name})`,
      { name }
    );
    await session.close();
  }

  async linkClassMethod(className: string, methodName: string) {
    const session = this.driver.session();

    await session.run(
      `
      MATCH (c:Class {name:$class})
      MATCH (m:Method {name:$method})
      MERGE (c)-[:DECLARES]->(m)
      `,
      { class: className, method: methodName }
    );

    await session.close();
  }

  async linkMethodCall(caller: string, callee: string) {
    const session = this.driver.session();

    await session.run(
      `
      MATCH (m1:Method {name:$caller})
      MATCH (m2:Method {name:$callee})
      MERGE (m1)-[:CALLS]->(m2)
      `,
      { caller, callee }
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