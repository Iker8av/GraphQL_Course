var express = require("express");
var { graphqlHTTP } = require("express-graphql");
var { buildSchema } = require("graphql");

// Contruyendo esquema con GraphQL schema language
var schema = buildSchema(`
    type Query {
        hello: String
    }
`);

// La raiz provee una funcion que resuelve cada endpoint del API
var root = {
  hello: () => {
    return "Hello World!";
  },
};

var app = express();
app.use(
  "/graphql",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);

app.listen(4000);
console.log("Running a GraphQL API server att http://localhost:4000/graphql");
