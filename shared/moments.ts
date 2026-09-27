export const MOMENT_PROMPTS = [
  "Take a picture of something you found funny.",
  "Show the view from where you are right now.",
  "Find something that reminds you of your person.",
  "Photograph the coziest corner of your day.",
  "Show a color that matches your mood.",
  "Capture a tiny detail you would usually walk past.",
  "Show something delicious from your day.",
  "Find a heart somewhere around you.",
  "Photograph something that made you pause.",
  "Show something you wish you could share right now.",
  "Capture an interesting shadow or reflection.",
  "Show your favorite little everyday object.",
  "Find something in your partner’s favorite color.",
  "Photograph a small sign of the season.",
  "Show something you are proud of today.",
  "Capture the sky where you are.",
  "Show something that feels like home.",
  "Find a surprising pattern.",
  "Photograph a little mess with a story behind it.",
  "Show what is keeping you company today.",
  "Find something that looks like it has a face.",
  "Capture a place you would like to take your partner.",
  "Show a small act of kindness you noticed.",
  "Photograph something older than you.",
  "Show something that brightened an ordinary moment.",
  "Capture two things that belong together.",
  "Show your day through a window.",
  "Find beauty in something ordinary.",
];
export const MOMENT_EMOJIS = ["❤️", "😂", "🥹", "😍", "✨", "👏"] as const;
export type MomentReaction = { userId: string; emoji: string; message: string };
export type MomentRound = {
  id: string;
  prompt: string;
  promptAt?: string;
  revealAt: string;
  expiresAt: string;
  photos: Record<
    string,
    { file: string; revision: string; reactions: MomentReaction[] }
  >;
};
export type MomentSchedule = {
  zone: string;
  revealTime?: string;
  firstReveal: string;
  rounds: MomentRound[];
  cadenceVersion?: 1 | 2;
};
export type MomentPhotoView = {
  userId: string;
  name: string;
  submitted: boolean;
  visible: boolean;
  revision?: string;
  reactions: MomentReaction[];
};
export type MomentRoundView = Omit<
  MomentRound,
  "photos" | "prompt" | "promptAt"
> & {
  prompt: string | null;
  promptAt: string;
  promptReleased: boolean;
  revealed: boolean;
  photos: MomentPhotoView[];
};
export type MomentsView = {
  serverNow: string;
  zone: string;
  revealTime: string;
  rounds: MomentRoundView[];
};
