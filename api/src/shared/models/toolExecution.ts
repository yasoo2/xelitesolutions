import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IToolExecution extends Document {
  runId?: Types.ObjectId;
  sessionId?: Types.ObjectId;
  name: string;
  input: any;
  output?: any;
  ok: boolean;
  logs: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ToolExecutionSchema = new Schema<IToolExecution>(
  {
    runId: { type: String, ref: 'Run', index: true },
    sessionId: { type: String, ref: 'Session', index: true },
    name: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    ok: { type: Boolean, default: false },
    logs: [String],
  },
  { timestamps: true }
);

export const ToolExecution = mongoose.model<IToolExecution>('ToolExecution', ToolExecutionSchema);
