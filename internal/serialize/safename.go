package serialize

import "regexp"

// validPropertyNameRegexp mirrors mion's helper at
// /home/user/mion/packages/run-types/src/constants.ts:81.
var validPropertyNameRegexp = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// isSafePropName returns true when name can be used with dot-accessor
// syntax (obj.foo); false when bracket notation is required
// (obj["weird name"]). All-digit names count as safe — mion treats
// number-typed keys the same way at the runtype level. Mirrors
// /home/user/mion/packages/run-types/src/lib/utils.ts:90.
func isSafePropName(name string) bool {
	if name == "" {
		return false
	}
	if isAllDigits(name) {
		return true
	}
	return validPropertyNameRegexp.MatchString(name)
}

func isAllDigits(name string) bool {
	for _, r := range name {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
