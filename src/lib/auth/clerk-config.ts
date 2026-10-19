/** Clerk is switched on by its publishable key (see .env.example). Safe to read on the client. */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
