import { mongoose } from "@colyseus/social";

/**
 * Hero
 */
export interface DBChatLog extends mongoose.Document {
  name: string,
  lvl: number,
  progress: number,

  text?: string,
  say?: string,
  killed?: string,
  slain?: string,

  timestamp: number
};

export const ChatLog = mongoose.model<DBChatLog>('ChatLog', new mongoose.Schema<DBChatLog>({
  name: String,
  lvl: Number,
  progress: Number,

  text: String,
  say: String,
  killed: String,
  slain: String,

  timestamp: Number
}, {
  versionKey: false
}));
