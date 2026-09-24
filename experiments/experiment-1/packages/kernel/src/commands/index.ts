import * as actors from "./actors.ts";
import * as evidence from "./evidence.ts";
import * as items from "./items.ts";
import * as relations from "./relations.ts";
import * as scopes from "./scopes.ts";

/** Every command, by name. The kernel dispatches over this table. */
export const commands = {
  createProject: scopes.createProject,
  updateProject: scopes.updateProject,
  archiveProject: scopes.archiveProject,
  addRepository: scopes.addRepository,
  createWorktree: scopes.createWorktree,
  updateWorktree: scopes.updateWorktree,
  setWorktreeStatus: scopes.setWorktreeStatus,

  createHuman: actors.createHuman,
  createAgent: actors.createAgent,
  updateAgent: actors.updateAgent,
  setAgentLifecycle: actors.setAgentLifecycle,
  assignAgent: actors.assignAgent,
  observeAgentLocation: actors.observeAgentLocation,

  createTask: items.createTask,
  updateTask: items.updateTask,
  setTaskStatus: items.setTaskStatus,
  raiseProblem: items.raiseProblem,
  updateProblem: items.updateProblem,
  resolveProblem: items.resolveProblem,
  dismissProblem: items.dismissProblem,
  raiseQuestion: items.raiseQuestion,
  answerQuestion: items.answerQuestion,
  recordDecision: items.recordDecision,
  requestAttention: items.requestAttention,
  resolveAttention: items.resolveAttention,
  dismissAttention: items.dismissAttention,
  escalateItem: items.escalateItem,
  assignOwner: items.assignOwner,

  recordCommit: evidence.recordCommit,
  explainCommit: evidence.explainCommit,
  openConversation: evidence.openConversation,
  joinConversation: evidence.joinConversation,
  postMessage: evidence.postMessage,
  setDelivery: evidence.setDelivery,
  markRead: evidence.markRead,

  link: relations.link,
  unlink: relations.unlink,
} as const;

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export const COMMAND_NAMES = Object.keys(commands) as CommandName[];

export { KernelError, type KernelErrorCode } from "./define.ts";
