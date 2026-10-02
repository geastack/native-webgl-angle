// Where each refusal sits in the source, for a failed fixture's assertion
// message. A refusal's owner is an operation id (`op|node|f624|CallExpression|1593|…`)
// or a function id (`fn|decl|f574|522`); the compiler's own location queries
// turn either into the file and line a reader needs.
export function refusalSites(result, refusals) {
  return refusals.map((item) => {
    const owner = String(item.owner)
    let location = null
    try {
      if (owner.startsWith('op|')) location = result.locationOfNode(owner.slice('op|'.length).split('|').slice(0, 4).join('|'))
      else if (owner.startsWith('fn|')) location = result.locationOfDeclaration(owner.slice('fn|'.length))
    } catch {
      location = null
    }
    return { key: item.key, owner, reason: item.reason, location }
  })
}
