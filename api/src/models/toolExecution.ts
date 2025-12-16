import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IToolExecution extends Document {
  runId?: Types.ObjectId;
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
    runId: { type: Schema.Types.ObjectId, ref: 'Run', index: true },
    name: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    ok: { type: Boolean, default: false },
    logs: [String],
  },
  { timestamps: true }
);

export const ToolExecution = mongoose.model<IToolExecution>('ToolExecution', ToolExecutionSchema);
