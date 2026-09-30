import { z } from "zod";
import type { GraphQLClient } from "../client.ts";

const count = z.object({ totalCount: z.number().int().nonnegative() });

const USER_QUERY = `
  query User($login: String!) {
    user(login: $login) {
      login
      name
      createdAt
      followers { totalCount }
      pullRequests(first: 1) { totalCount }
      openIssues: issues(states: OPEN) { totalCount }
      closedIssues: issues(states: CLOSED) { totalCount }
      contributionsCollection { totalPullRequestReviewContributions }
      repositoriesContributedTo(
        first: 1
        contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]
      ) { totalCount }
    }
  }
`;

const UserResponseSchema = z.object({
  user: z.object({
    login: z.string(),
    name: z.string().nullable(),
    createdAt: z.iso.datetime(),
    followers: count,
    pullRequests: count,
    openIssues: count,
    closedIssues: count,
    contributionsCollection: z.object({
      totalPullRequestReviewContributions: z.number().int().nonnegative(),
    }),
    repositoriesContributedTo: count,
  }),
});

export interface UserStats {
  login: string;
  name: string | null;
  followers: number;
  createdAt: Date;
  prs: number;
  issues: number;
  reviews: number;
  contributedTo: number;
}

export async function fetchUser(
  client: GraphQLClient,
  username: string,
): Promise<UserStats> {
  const { user } = await client.query(
    USER_QUERY,
    { login: username },
    UserResponseSchema,
  );

  return {
    login: user.login,
    name: user.name,
    followers: user.followers.totalCount,
    createdAt: new Date(user.createdAt),
    prs: user.pullRequests.totalCount,
    issues: user.openIssues.totalCount + user.closedIssues.totalCount,
    reviews: user.contributionsCollection.totalPullRequestReviewContributions,
    contributedTo: user.repositoriesContributedTo.totalCount,
  };
}
