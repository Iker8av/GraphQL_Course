// const { gql, ApolloServer } = require("apollo-server");
// const { Neo4jGraphQL } = require("@neo4j/graphql");
// const neo4j = require("neo4j-driver");
// require("dotenv").config();
import { gql } from "apollo-server";
import { ApolloServer } from "apollo-server";
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";
import dotenv from "dotenv";
dotenv.config();

const typeDefs = gql`
  type Movie {
    title: String!
    year: Int
    plot: String
    actors: [Person!]! @relationship(type: "ACTED_IN", direction: IN)
  }

  type Person {
    name: String!
    movies: [Movie!]! @relationship(type: "ACTED_IN", direction: OUT)
  }

  input ActorInput {
    name: String!
  }

  input CreateMovieInput {
    title: String!
    year: Int
    plot: String
    actors: [ActorInput!]!
  }

  input AddActorInput {
    movieTitle: String!
    actor: ActorInput
  }

  input MovieWhere {
    imdbRating_GT: Int
  }

  enum MovieSortField {
    imdbRating
  }

  input MovieSort {
    field: MovieSortField
    order: SortOrder
  }

  enum SortOrder {
    ASC
    DESC
  }

  input MovieOptions {
    limit: Int
    sort: [SortOrder]
  }

  input MovieFilter {
    imdbRating_GT: Int
  }

  type Mutation {
    createMovie(input: CreateMovieInput!): Movie
    addActor(input: AddActorInput!): Person
  }

  type Query {
    movies(where: MovieFilter, options: MovieOptions): [Movie]
  }
`;

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Handle the error, log it, or throw an exception
});

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

const neoSchema = new Neo4jGraphQL({ typeDefs, driver });

const resolvers = {
  Mutation: {
    createMovie: async (_, { input }, { driver, session }) => {
      try {
        const result = await session.writeTransaction(async (tx) => {
          // Create movie node
          const movie = await tx.run(
            `
            CREATE (m:Movie $input)
            RETURN m
          `,
            { input }
          );

          // Create actor nodes and relationships
          for (const actorInput of input.actors) {
            await tx.run(
              `
              MATCH (m:Movie), (p:Person {name: $actorName})
              WHERE ID(m) = ID($movieId)
              CREATE (p)-[:ACTED_IN]->(m)
            `,
              {
                actorName: actorInput.name,
                movieId: movie.records[0].get("m").identity,
              }
            );
          }

          return movie.records[0].get("m").properties;
        });

        return result;
      } catch (error) {
        console.error("Error in createMovie resolver:", error);
        throw error;
      }
    },
    addActor: async (_, { input }, { driver, session }) => {
      try {
        const result = await session.writeTransaction(async (tx) => {
          const person = await tx.run(
            `
            CREATE (p:Person {name: $name})
            RETURN p
          `,
            { name: input.actor.name }
          );

          await tx.run(
            `
        MATCH (m:Movie {title: $movieTitle}), (p:Person {name: $name})
        CREATE (p)-[:ACTED_IN]->(m)
      `,
            { name: input.actor.name, movieTitle: input.movieTitle }
          );

          return person.records[0].get("p").properties;
        });

        return result;
      } catch (error) {
        console.error("Error in addActor resolver:", error);
        throw error;
      }
    },
  },

  Query: {
    movies: async (_, { where, options }, { driver, session }) => {
      try {
        const result = await session.readTransaction(async (tx) => {
          const params = {};
          let whereClause = "";
          let optionsClause = "";

          if (where && where.imdbRating_GT !== undefined) {
            whereClause += "WHERE m.imdbRating > $imdbRating_GT ";
            params.imdbRating_GT = where.imdbRating_GT;
          }

          if (options) {
            if (options.limit !== undefined) {
              optionsClause += "LIMIT $limit ";
              params.limit = options.limit;
            }

            if (options.sort && options.sort.length > 0) {
              optionsClause += "ORDER BY ";
              options.sort.forEach((sort) => {
                optionsClause += `m.${sort.field} ${sort.order} `;
              });
            }
          }

          const query = `
          MATCH (m:Movie) ${whereClause}
          RETURN m ${optionsClause}
        `;

          const result = await tx.run(query, params);
          return result.records.map((record) => record.get("m").properties);
        });

        return result;
      } catch (error) {
        console.error("Error in movies resolver:", error);
        throw error;
      }
    },
  },
};

neoSchema.getSchema().then((schema) => {
  const server = new ApolloServer({
    schema,
    context: ({ req }) => {
      return {
        headers: req.headers,
        driver,
      };
    },
    resolvers,
  });

  const PORT = process.env.PORT || 4000;

  server.listen(PORT).then(({ url }) => {
    console.log(`GraphQL server ready on ${url}`);
  });
});
