import { redirect } from "next/navigation";

/** The bare address lands on the home screen, not in the middle of the work.
 *
 *  It redirected to /capture, which is the screen an audit is DONE on and the
 *  worst one to arrive at: a discipline rail, a chip grid and 315 rows, before
 *  anything has said which audit you are in or what is waiting.
 *
 *  THE MANIFEST STILL STARTS AT /capture, deliberately. `start_url` must be a
 *  real screen rather than a redirect — a launch that begins with a redirect
 *  begins with a network request, and on an apron there may not be one. So the
 *  installed app opens where the work is and the browser opens where the
 *  orientation is, which is the right way round: the auditor who taps the icon
 *  on a stand is mid-audit, and the one typing the address is arriving. */
export default function Home() {
  redirect("/home");
}
