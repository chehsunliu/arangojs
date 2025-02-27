import { expect } from "chai";
import { aql } from "../aql.js";
import { Cursor } from "../cursors.js";
import { Database } from "../databases.js";
import { config } from "./_config.js";
import { QueryOptions } from "../queries.js";

describe("AQL Stream queries", function () {
  const name = `testdb_${Date.now()}`;
  let system: Database, db: Database;
  let allCursors: Cursor[];
  before(async () => {
    allCursors = [];
    system = new Database(config);
    if (Array.isArray(config.url) && config.loadBalancingStrategy !== "NONE")
      await system.acquireHostList();
    db = await system.createDatabase(name);
  });
  after(async () => {
    await Promise.all(
      allCursors.map((cursor) => cursor.kill().catch(() => undefined)),
    );
    try {
      await system.dropDatabase(name);
    } finally {
      system.close();
    }
  });
  describe("database.query", () => {
    it("returns a cursor for the query result", async () => {
      const cursor = await db.query("RETURN 23", {}, { stream: true });
      allCursors.push(cursor);
      expect(cursor).to.be.an.instanceof(Cursor);
    });
    it("supports bindVars", async () => {
      const cursor = await db.query("RETURN @x", { x: 5 }, { stream: true });
      allCursors.push(cursor);
      const value = await cursor.next();
      expect(value).to.equal(5);
    });
    it("supports options", async () => {
      const cursor = await db.query("FOR x IN 1..10 RETURN x", undefined, {
        batchSize: 2,
        count: true, // should be ignored
        stream: true,
      });
      allCursors.push(cursor);
      expect(cursor.count).to.equal(undefined);
      expect(cursor.batches.hasMore).to.equal(true);
    });
    it("supports compact queries with options", async () => {
      const query: any = {
        query: "FOR x IN RANGE(1, @max) RETURN x",
        bindVars: { max: 10 },
      };
      const cursor = await db.query(query, {
        batchSize: 2,
        count: true,
        stream: true,
      });
      allCursors.push(cursor);
      expect(cursor.count).to.equal(undefined); // count will be ignored
      expect(cursor.batches.hasMore).to.equal(true);
    });
  });
  describe("with some data", () => {
    const cname = "MyTestCollection";
    before(async () => {
      const collection = await db.createCollection(cname);
      await db.waitForPropagation(
        { pathname: `/_api/collection/${collection.name}` },
        10000,
      );
      await Promise.all(
        Array.from(Array(1000).keys()).map((i: number) =>
          collection.save({ hallo: i }),
        ),
      );
    });
    /*after(async () => {
      await db.collection(cname).drop()
    });*/
    it("can access large collection in parallel", async () => {
      const collection = db.collection(cname);
      const query = aql`FOR doc in ${collection} RETURN doc`;
      const options = { batchSize: 250, stream: true };

      let count = 0;
      const cursors = await Promise.all(
        Array.from(Array(25)).map(() => db.query(query, options)),
      );
      allCursors.push(...cursors);
      await Promise.all(
        cursors.map((c) =>
          (c as Cursor).forEach(() => {
            count++;
          }),
        ),
      );
      expect(count).to.equal(25 * 1000);
    });
    it("can do writes and reads", async () => {
      const collection = db.collection(cname);
      const readQ = aql`FOR doc in ${collection} RETURN doc`;
      const writeQ = aql`FOR i in 1..10000 LET y = SLEEP(1) INSERT {forbidden: i} INTO ${collection}`;
      const options: QueryOptions = {
        batchSize: 500,
        ttl: 5,
        maxRuntime: 5,
        stream: true,
      };

      const readCursor = db.query(readQ, options);
      const writeCursor = db.query(writeQ, options);

      // the read cursor should always win
      const c = await Promise.race([readCursor, writeCursor]);
      allCursors.push(c);
      // therefore no document should have been written here
      for await (const d of c) {
        expect(d).not.to.haveOwnProperty("forbidden");
      }
    });
  });
});
