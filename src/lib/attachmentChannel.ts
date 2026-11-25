import type { Attachment } from "@/lib/types";

export type AttachmentChannel = "check" | "walk" | "evidence";

/** Which channel an attachment belongs to. Explicit when it was tagged at
 *  capture; otherwise inferred from what it is: a file is a document (evidence),
 *  a voice note is the desk observation's (check), a photograph is the walk's.
 *  Untagged photographs from before this field existed are the walk's because
 *  that is where nearly all were taken; nothing is lost either way, the
 *  attachment is still on the check. */
export function channelOf(a: Pick<Attachment, "kind" | "channel">): AttachmentChannel {
  if (a.channel) return a.channel;
  if (a.kind === "file") return "evidence";
  if (a.kind === "voice") return "check";
  return "walk";
}
