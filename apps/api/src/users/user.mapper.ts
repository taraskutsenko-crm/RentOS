import type { User } from "@prisma/client";

/** A User with `passwordHash` removed — the only shape ever sent to a client. */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
