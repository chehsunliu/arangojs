import { expect } from "chai";
import { aql, join, literal } from "../aql.js";
import { Database } from "../databases.js";

describe("AQL helpers", function () {
  describe("aql", () => {
    const db = new Database();
    it("supports simple parameters", () => {
      const values = [
        0,
        42,
        -1,
        null,
        true,
        false,
        "",
        "string",
        [1, 2, 3],
        { a: "b" },
      ];
      const query = aql`A ${values[0]} B ${values[1]} C ${values[2]} D ${values[3]} E ${values[4]} F ${values[5]} G ${values[6]} H ${values[7]} I ${values[8]} J ${values[9]} K EOF`;
      expect(query.query).to.equal(
        `A @value0 B @value1 C @value2 D @value3 E @value4 F @value5 G @value6 H @value7 I @value8 J @value9 K EOF`,
      );
      const bindVarNames = Object.keys(query.bindVars).sort((a, b) =>
        +a.substr(5) > +b.substr(5) ? 1 : -1,
      );
      expect(bindVarNames).to.eql([
        "value0",
        "value1",
        "value2",
        "value3",
        "value4",
        "value5",
        "value6",
        "value7",
        "value8",
        "value9",
      ]);
      expect(bindVarNames.map((k) => query.bindVars[k])).to.eql(values);
    });
    it("omits undefined bindvars and empty queries", () => {
      const query = aql`A ${undefined} B ${aql``} C ${join([])} D ${literal(
        "",
      )} E`;
      expect(query.query).to.equal("A  B  C  D  E");
      expect(query.bindVars).to.eql({});
    });
    it("supports arangojs collection parameters", () => {
      const collection = db.collection("potato");
      const query = aql`${collection}`;
      expect(query.query).to.equal("@@value0");
      expect(Object.keys(query.bindVars)).to.eql(["@value0"]);
      expect(query.bindVars["@value0"]).to.equal("potato");
    });
    it("supports arangojs view parameters", () => {
      const view = db.view("banana");
      const query = aql`${view}`;
      expect(query.query).to.equal("@@value0");
      expect(Object.keys(query.bindVars)).to.eql(["@value0"]);
      expect(query.bindVars["@value0"]).to.equal("banana");
    });
    it("supports ArangoDB collection parameters", () => {
      class ArangoCollection {
        isArangoCollection = true as const;
        name = "tomato";
      }
      const collection = new ArangoCollection();
      const query = aql`${collection}`;
      expect(query.query).to.equal("@@value0");
      expect(Object.keys(query.bindVars)).to.eql(["@value0"]);
      expect(query.bindVars["@value0"]).to.equal("tomato");
    });
    it("supports arbitrary types", () => {
      interface Whatever {
        color: string;
        more: {
          x: number;
        };
      }
      const whatever: Whatever[] = [
        { color: "green", more: { x: 2 } },
        { color: "yellow", more: { x: 3 } },
      ];
      const query = aql`${whatever}`;
      expect(query.query).to.equal("@value0");
      expect(Object.keys(query.bindVars)).to.eql(["value0"]);
      expect(query.bindVars.value0).to.equal(whatever);
    });
    it("supports arbitrary classes", () => {
      class Whatever {
        color: string;
        constructor(color: string) {
          this.color = color;
        }
      }
      const whatever: Whatever[] = [
        new Whatever("green"),
        new Whatever("yellow"),
      ];
      const query = aql`${whatever}`;
      expect(query.query).to.equal("@value0");
      expect(Object.keys(query.bindVars)).to.eql(["value0"]);
      expect(query.bindVars.value0).to.equal(whatever);
    });
    it("supports AQL literals", () => {
      const query = aql`FOR x IN whatever ${literal("FILTER x.blah")} RETURN x`;
      expect(query.query).to.equal("FOR x IN whatever FILTER x.blah RETURN x");
      expect(query.bindVars).to.eql({});
    });
    it("supports nesting simple queries", () => {
      const query = aql`FOR x IN (${aql`FOR a IN 1..3 RETURN a`}) RETURN x`;
      expect(query.query).to.equal(
        "FOR x IN (FOR a IN 1..3 RETURN a) RETURN x",
      );
    });
    it("supports deeply nesting simple queries", () => {
      const query = aql`FOR x IN (${aql`FOR a IN (${aql`FOR b IN 1..3 RETURN b`}) RETURN a`}) RETURN x`;
      expect(query.query).to.equal(
        "FOR x IN (FOR a IN (FOR b IN 1..3 RETURN b) RETURN a) RETURN x",
      );
    });
    it("supports nesting with bindVars", () => {
      const collection = db.collection("paprika");
      const query = aql`A ${collection} B ${aql`X ${collection} Y ${aql`J ${collection} K ${9} L`} Z`} C ${4}`;
      expect(query.query).to.equal(
        "A @@value0 B X @@value0 Y J @@value0 K @value1 L Z C @value2",
      );
      expect(query.bindVars).to.eql({
        "@value0": "paprika",
        value1: 9,
        value2: 4,
      });
    });
    it("supports arbitrary nesting", () => {
      const users = db.collection("users");
      const role = "admin";
      const filter = aql`FILTER u.role == ${role}`;
      const query = aql`FOR u IN ${users} ${filter} RETURN u`;
      expect(query.query).to.equal(
        "FOR u IN @@value0 FILTER u.role == @value1 RETURN u",
      );
      expect(query.bindVars).to.eql({
        "@value0": users.name,
        value1: role,
      });
    });
    it("supports basic nesting", () => {
      const query = aql`A ${aql`a ${1} b`} B`;
      expect(query.query).to.equal("A a @value0 b B");
      expect(query.bindVars).to.eql({ value0: 1 });
    });
    it("supports deep nesting", () => {
      const query = aql`A ${1} ${aql`a ${2} ${aql`X ${3} ${aql`x ${4} y`} ${5} Y`} ${6} b`} ${7} B`;
      expect(query.query).to.equal(
        "A @value0 a @value1 X @value2 x @value3 y @value4 Y @value5 b @value6 B",
      );
      expect(query.bindVars).to.eql({
        value0: 1,
        value1: 2,
        value2: 3,
        value3: 4,
        value4: 5,
        value5: 6,
        value6: 7,
      });
    });
    it("supports nesting without bindvars", () => {
      const query = aql`A ${aql`B`} C`;
      expect(query.query).to.equal("A B C");
      expect(query.bindVars).to.eql({});
    });
  });
  describe("literal", () => {
    const pairs = [
      [0, "0"],
      [42, "42"],
      [-1, "-1"],
      [undefined, ""],
      [null, "null"],
      [true, "true"],
      [false, "false"],
      ["", ""],
      ["string", "string"],
    ];
    for (const [value, result] of pairs) {
      it(`returns an AQL literal of "${result}" for ${String(
        JSON.stringify(value),
      )}`, () => {
        expect(literal(value).toAQL()).to.equal(result);
      });
    }
    it('returns an AQL literal of "aql" for { toAQL: () => "aql" }', () => {
      expect(literal({ toAQL: () => "aql" }).toAQL()).to.equal("aql");
    });
  });
  describe("join", () => {
    const fragments = [aql`x ${1}`, aql`y ${2}`, aql`z ${3}`];
    it("merges fragments with a space by default", () => {
      const query = join(fragments);
      expect(query.query).to.equal("x @value0 y @value1 z @value2");
      expect(query.bindVars).to.eql({ value0: 1, value1: 2, value2: 3 });
    });
    it("merges fragments with an empty string", () => {
      const query = join(fragments, "");
      expect(query.query).to.equal("x @value0y @value1z @value2");
      expect(query.bindVars).to.eql({ value0: 1, value1: 2, value2: 3 });
    });
    it("merges fragments with an arbitrary string", () => {
      const query = join(fragments, "abc");
      expect(query.query).to.equal("x @value0abcy @value1abcz @value2");
      expect(query.bindVars).to.eql({ value0: 1, value1: 2, value2: 3 });
    });
    it("merges anything", () => {
      const query = join([1, true, "yes", literal("test")]);
      expect(query.query).to.equal("@value0 @value1 @value2 test");
      expect(query.bindVars).to.eql({ value0: 1, value1: true, value2: "yes" });
    });
  });
});
