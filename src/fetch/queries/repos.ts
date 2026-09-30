import { z } from "zod";
import { StatsError } from "../../errors.ts";
import type { GraphQLClient } from "../client.ts";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

const REPOS_QUERY = `
  query Repos($login: String!, $after: String) {
    user(login: $login) {
      repositories(
        first: ${PAGE_SIZE}
        after: $after
        ownerAffiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR]
      ) {
        nodes {
          nameWithOwner
          isFork
          owner { login }
          stargazers { totalCount }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node { name color }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const RepoSchema = z.object({
  nameWithOwner: z.string(),
  isFork: z.boolean(),
  owner: z.object({ login: z.string() }),
  stargazers: z.object({ totalCount: z.number().int().nonnegative() }),
  languages: z
    .object({
      edges: z
        .array(
          z.object({
            size: z.number().int().nonnegative(),
            node: z.object({ name: z.string(), color: z.string().nullable() }),
          }),
        )
        .nullable(),
    })
    .nullable(),
});

const ReposResponseSchema = z.object({
  user: z.object({
    repositories: z.object({
      nodes: z
        .array(RepoSchema.nullable())
        .transform((nodes) => nodes.filter((node) => node !== null)),
      pageInfo: z.object({
        hasNextPage: z.boolean(),
        endCursor: z.string().nullable(),
      }),
    }),
  }),
});

type ReposResponse = z.infer<typeof ReposResponseSchema>;

export interface RepoLanguage {
  name: string;
  color: string | null;
  size: number;
}

export interface RepoNode {
  nameWithOwner: string;
  ownerLogin: string;
  isFork: boolean;
  stars: number;
  languages: RepoLanguage[];
}

export async function fetchRepos(
  client: GraphQLClient,
  username: string,
): Promise<RepoNode[]> {
  const repos: RepoNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response: ReposResponse = await client.query(
      REPOS_QUERY,
      { login: username, after },
      ReposResponseSchema,
    );
    const { nodes, pageInfo } = response.user.repositories;

    for (const node of nodes) {
      repos.push({
        nameWithOwner: node.nameWithOwner,
        ownerLogin: node.owner.login,
        isFork: node.isFork,
        stars: node.stargazers.totalCount,
        languages: (node.languages?.edges ?? []).map((edge) => ({
          name: edge.node.name,
          color: edge.node.color,
          size: edge.size,
        })),
      });
    }

    if (!pageInfo.hasNextPage || pageInfo.endCursor === null) {
      return repos;
    }
    after = pageInfo.endCursor;
  }

  throw new StatsError(
    "API_ERROR",
    `Repository list exceeds the limit of ${MAX_PAGES * PAGE_SIZE} entries`,
  );
}
