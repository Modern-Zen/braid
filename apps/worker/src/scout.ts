// Scout: side-by-side comparison of an Intent's Channels and the judge's verdict (M4).
// maybeJudge() runs when every Channel has finished and every head has a review.

export async function maybeJudge(_env: Env, _riverId: string, _intentId: string): Promise<void> {
  // M4: rank Channels (tests, diffstat, risk, cost, Logbooks), write the verdict,
  // open an Eddy `pick` card on a tie, else hand the winner to Confluence.
}
