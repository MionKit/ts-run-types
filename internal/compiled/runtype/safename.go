package runtype

import "regexp"

// validPropertyNameRegexp mirrors mion's helper at
// /home/user/mion/packages/run-types/src/constants.ts:81.
var validPropertyNameRegexp = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// isSafeName returns true when name can be used with dot-accessor
// syntax (obj.foo); false when bracket notation is required
// (obj["weird name"]). Mirrors
// /home/user/mion/packages/run-types/src/lib/utils.ts:90 — minus mion's
// `typeof name === 'number'` short-circuit. Mion treats number-typed keys
// as safe because `obj[5]` is valid, but in our wire model all names are
// strings; the regex already rejects leading-digit names ("5") and dot
// access on a numeric-stringified name (`obj.5`) is a JS syntax error
// anyway. So the regex alone is the right answer here.
func isSafeName(name string) bool {
	if name == "" {
		return false
	}
	return validPropertyNameRegexp.MatchString(name)
}
