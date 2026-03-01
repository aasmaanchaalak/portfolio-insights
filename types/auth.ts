export interface User {
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Session {
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface JWTPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  email: string;
  name: string;
}
