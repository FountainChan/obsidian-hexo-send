import { HexoSendError } from "./errors";
import type { JobState } from "./publish-types";

const transitions: Record<JobState, readonly JobState[]> = {
  scanning: ["enriching", "cancelled", "validation_failed"],
  enriching: ["awaiting_review", "cancelled", "validation_failed"],
  awaiting_review: ["generating", "cancelled"],
  generating: ["validating", "cancelled", "validation_failed"],
  validating: ["committing", "cancelled", "validation_failed"],
  committing: ["committed", "commit_failed"],
  committed: ["pushing"],
  pushing: ["pushed", "push_failed"],
  push_failed: ["pushing"],
  pushed: [],
  cancelled: [],
  validation_failed: [],
  commit_failed: [],
};

export class PublishStateMachine {
  constructor(private current: JobState = "scanning") {}
  get state(): JobState { return this.current; }
  can(next: JobState): boolean { return transitions[this.current].includes(next); }
  transition(next: JobState): void {
    if (!this.can(next)) {
      throw new HexoSendError("INVALID_STATE", `不能从 ${this.current} 进入 ${next}`);
    }
    this.current = next;
  }
}
