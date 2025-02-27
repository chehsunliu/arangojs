import { expect } from "chai";
import { DocumentCollection } from "../collections.js";
import { Database } from "../databases.js";
import { Route } from "../routes.js";
import { config } from "./_config.js";

describe("Arbitrary HTTP routes", () => {
  let db: Database;
  before(async () => {
    db = new Database();
  });
  describe("database.route", () => {
    it("returns a Route instance", () => {
      const route = db.route();
      expect(route).to.be.an.instanceof(Route);
    });
    it("creates a route for the given path", () => {
      const path = "/hi";
      const route = db.route(path);
      expect((route as any)._pathname).to.equal(path);
    });
    it("passes the given headers to the new route", () => {
      const route = db.route("/hello", { "x-magic": "awesome" });
      const headers = (route as any)._headers as Headers;
      expect(headers.get("x-magic")).to.equal("awesome");
    });
  });
});

describe("Route API", function () {
  const name = `testdb_${Date.now()}`;
  let system: Database, db: Database;
  let collection: DocumentCollection;
  before(async () => {
    system = new Database(config);
    if (Array.isArray(config.url) && config.loadBalancingStrategy !== "NONE")
      await system.acquireHostList();
    db = await system.createDatabase(name);
    collection = await db.createCollection(`c_${Date.now()}`);
    await db.waitForPropagation(
      { pathname: `/_api/collection/${collection.name}` },
      10000,
    );
  });
  after(async () => {
    try {
      await system.dropDatabase(name);
    } finally {
      system.close();
    }
  });
  beforeEach(async () => {
    await collection.truncate();
  });
  describe("route.route", () => {
    it("should concat path", () => {
      const route = db.route("/_api").route("/version");
      expect(route).to.have.property("_pathname", "/_api/version");
    });
  });
  describe("route.get", () => {
    it("should be executed using the route path", async () => {
      const res = await db.route("/_api/version").get();
      expect(res).to.have.property("parsedBody");
      const body = res.parsedBody;
      expect(body).to.have.property("version");
      expect(body).to.have.property("server");
    });
    it("should concat path to route path", async () => {
      const res = await db.route("/_api").get("/version");
      expect(res).to.have.property("parsedBody");
      const body = res.parsedBody;
      expect(body).to.have.property("version");
      expect(body).to.have.property("server");
    });
    it("should passes query parameters", async () => {
      const res = await db.route("/_api").get("/version", { details: true });
      expect(res).to.have.property("parsedBody");
      const body = res.parsedBody;
      expect(body).to.have.property("version");
      expect(body).to.have.property("server");
      expect(body).to.have.property("details");
    });
  });
  describe("route.post", () => {
    it("should passes body", async () => {
      const res = await db
        .route(`/_api/document/${collection.name}`)
        .post({ foo: "bar" });
      expect(res).to.have.property("parsedBody");
      expect(res.parsedBody).to.have.property("_id");
      expect(res.parsedBody).to.have.property("_key");
      expect(res.parsedBody).to.have.property("_rev");
    });
  });
  describe("route.put", () => {
    let documentHandle: string;
    beforeEach(async () => {
      const doc = await collection.save({ foo: "bar" });
      documentHandle = doc._id;
    });
    it("should pass body", async () => {
      const res = await db
        .route(`/_api/document/${documentHandle}`)
        .put({ hello: "world" });
      expect(res).to.have.property("parsedBody");
      expect(res.parsedBody).to.have.property("_id");
      expect(res.parsedBody).to.have.property("_key");
      expect(res.parsedBody).to.have.property("_rev");
    });
  });
  describe("route.patch", () => {
    let documentHandle: string;
    beforeEach(async () => {
      const doc = await collection.save({ foo: "bar" });
      documentHandle = doc._id;
    });
    it("should passes body", async () => {
      const res = await db
        .route(`/_api/document/${documentHandle}`)
        .patch({ hello: "world" });
      expect(res).to.have.property("parsedBody");
      expect(res.parsedBody).to.have.property("_id");
      expect(res.parsedBody).to.have.property("_key");
      expect(res.parsedBody).to.have.property("_rev");
    });
  });
  describe("route.delete", () => {
    let documentHandle: string;
    beforeEach(async () => {
      const doc = await collection.save({ foo: "bar" });
      documentHandle = doc._id;
    });
    it("should be executed using the route path", async () => {
      const res = await db.route(`/_api/document/${documentHandle}`).delete();
      expect(res).to.have.property("parsedBody");
      expect(res.parsedBody).to.have.property("_id");
      expect(res.parsedBody).to.have.property("_key");
      expect(res.parsedBody).to.have.property("_rev");
    });
  });
  describe("route.head", () => {
    let documentHandle: string;
    beforeEach(async () => {
      const doc = await collection.save({ foo: "bar" });
      documentHandle = doc._id;
    });
    it("should be executed using the route path", async () => {
      const res = await db.route(`/_api/document/${documentHandle}`).head();
      expect(res).to.have.property("status", 200);
    });
  });
  describe("route.request", () => {
    it("should be executed using the route path", async () => {
      const res = await db.route("/_api/version").request({ method: "GET" });
      expect(res).to.have.property("parsedBody");
      const body = res.parsedBody;
      expect(body).to.have.property("version");
      expect(body).to.have.property("server");
    });
  });
});
