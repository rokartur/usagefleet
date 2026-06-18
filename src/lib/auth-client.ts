"use client";
import { createAuthClient } from "better-auth/react";

// No baseURL → the client calls the same origin it's served from, so the app
// works on any host/port without rebuilding (NEXT_PUBLIC_APP_URL is build-time).
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
