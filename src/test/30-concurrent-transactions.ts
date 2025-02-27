/* eslint-disable no-console */
import { expect } from "chai";
import { DocumentCollection } from "../collections.js";
import { Connection } from "../connection.js";
import { Database } from "../databases.js";
import { Transaction } from "../transactions.js";
import { config } from "./_config.js";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

describe("Transactions", function () {
  describe.skip("stream transactions", function () {
    this.timeout(0);
    let system: Database, db: Database;
    before(async () => {
      system = new Database(config);
      if (Array.isArray(config.url) && config.loadBalancingStrategy !== "NONE")
        await system.acquireHostList();
    });
    after(() => {
      system.close();
    });
    const name = `testdb_${Date.now()}`;
    let collection: DocumentCollection;
    let allTransactions: Transaction[];
    before(async () => {
      allTransactions = [];
      await system.createDatabase(name);
      db = system.database(name);
    });
    after(async () => {
      await Promise.all(
        allTransactions.map((transaction) =>
          transaction.abort().catch(() => undefined),
        ),
      );
      try {
        await system.dropDatabase(name);
      } catch {}
    });
    beforeEach(async () => {
      collection = await db.createCollection(`collection-${Date.now()}`);
      await db.waitForPropagation(
        { pathname: `/_api/collection/${collection.name}` },
        10000,
      );
    });
    afterEach(async () => {
      try {
        await collection.get();
      } catch (e: any) {
        return;
      }
      await collection.drop();
    });

    it("can run concurrent transactions in parallel", async () => {
      const conn = (db as any)._connection as Connection;
      const range = Array.from(Array((conn as any)._taskPoolSize).keys()).map(
        (i) => i + 1,
      );
      let failed = 0;
      await Promise.all(
        range.map(async (i) => {
          const started = Date.now();
          let trx;
          try {
            trx = await db.beginTransaction({ exclusive: collection });
            console.log(
              i,
              "trx",
              trx.id,
              "completed begin after",
              Date.now() - started,
              "ms elapsed",
            );
            await trx.step(() => collection.save({ enabled: true }));
            console.log(
              i,
              "trx",
              trx.id,
              "completed save after",
              Date.now() - started,
              "ms elapsed",
            );
            await delay(Math.random() * 10);
            await trx.commit();
            console.log(
              i,
              "trx",
              trx.id,
              "completed commit after",
              Date.now() - started,
              "ms elapsed",
            );
          } catch (e: any) {
            console.error(
              i,
              "trx",
              trx ? trx.id : "???",
              "failed after",
              Date.now() - started,
              "ms elapsed:",
              String(e),
            );
            failed++;
          }
        }),
      );
      expect(failed).to.equal(0);
    });
    it("respects transactional guarantees", async () => {
      const conn = (db as any)._connection as Connection;
      const range = Array.from(Array((conn as any)._taskPoolSize).keys()).map(
        (i) => i + 1,
      );
      const key = "test";
      await collection.save({ _key: key, i: 0 });
      let failed = 0;
      await Promise.all(
        range.map(async (value) => {
          try {
            console.log(value, "beginning...");
            const trx = await db.beginTransaction({ exclusive: collection });
            console.log(value, "begun with ID", trx.id);
            const doc = await trx.step(() => collection.document(key));
            console.log(value, "waiting...");
            await delay(Math.random() * 10);
            console.log(
              value,
              "seen",
              doc.i,
              "adding",
              value,
              "=",
              doc.i + value,
            );
            await trx.step(() => collection.update(key, { i: doc.i + value }));
            console.log(value, "committing");
            await trx.commit();
            console.log(value, "done");
          } catch (e: any) {
            console.error(value, "failed:", String(e));
            failed++;
          }
        }),
      );
      const doc = await collection.document(key);
      expect(doc.i).to.equal(range.reduce((a, b) => a + b));
      expect(failed).to.equal(0);
    });
  });
});
