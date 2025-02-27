import { expect } from "chai";
import { Analyzer } from "../analyzers.js";
import { Database } from "../databases.js";
import { config } from "./_config.js";

const range = (n: number): number[] => Array.from(Array(n).keys());

describe("Accessing analyzers", function () {
  const builtins: string[] = [];
  const name = `testdb_${Date.now()}`;
  let system: Database, db: Database;
  before(async () => {
    system = new Database(config);
    if (Array.isArray(config.url) && config.loadBalancingStrategy !== "NONE")
      await system.acquireHostList();
    db = await system.createDatabase(name);
    builtins.push(...(await db.listAnalyzers()).map((a) => a.name));
    expect(builtins).not.to.have.length(0);
  });
  after(async () => {
    try {
      await system.dropDatabase(name);
    } finally {
      system.close();
    }
  });
  describe("database.analyzer", () => {
    it("returns a Analyzer instance for the analyzer", () => {
      const name = "potato";
      const analyzer = db.analyzer(name);
      expect(analyzer).to.be.an.instanceof(Analyzer);
      expect(analyzer).to.have.property("name").that.equals(name);
    });
  });
  describe("database.listAnalyzers", () => {
    const analyzerNames = range(4).map((i) => `${name}::a_${Date.now()}_${i}`);
    let allNames: string[];
    before(async () => {
      allNames = [...builtins, ...analyzerNames].sort();
      await Promise.all(
        analyzerNames.map(async (name) => {
          const analyzer = db.analyzer(name.replace(/^[^:]+::/, ""));
          await analyzer.create({ type: "identity" });
          await db.waitForPropagation(
            { pathname: `/_api/analyzer/${analyzer.name}` },
            65000,
          );
        }),
      );
    });
    after(async () => {
      await Promise.all(
        analyzerNames.map((name) =>
          db.analyzer(name.replace(/^[^:]+::/, "")).drop(),
        ),
      );
    });
    it("fetches information about all analyzers", async () => {
      const analyzers = await db.listAnalyzers();
      expect(analyzers.map((a) => a.name).sort()).to.eql(allNames);
    });
  });
  describe("database.analyzers", () => {
    const analyzerNames = range(4).map((i) => `${name}::a_${Date.now()}_${i}`);
    let allNames: string[];
    before(async () => {
      allNames = [...builtins, ...analyzerNames].sort();
      await Promise.all(
        analyzerNames.map(async (name) => {
          const analyzer = db.analyzer(name.replace(/^[^:]+::/, ""));
          await analyzer.create({ type: "identity" });
          await db.waitForPropagation(
            { pathname: `/_api/analyzer/${analyzer.name}` },
            65000,
          );
        }),
      );
    });
    after(async () => {
      await Promise.all(
        analyzerNames.map((name) =>
          db.analyzer(name.replace(/^[^:]+::/, "")).drop(),
        ),
      );
    });
    it("creates Analyzer instances", async () => {
      const analyzers = await db.analyzers();
      for (const analyzer of analyzers) {
        expect(analyzer).to.be.instanceOf(Analyzer);
      }
      expect(analyzers.map((a) => a.name).sort()).to.eql(allNames);
    });
  });
});
