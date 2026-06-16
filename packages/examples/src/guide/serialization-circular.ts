import {createJsonEncoder, createBinaryEncoder, CircularReferenceError, setRejectCircularRefs} from 'ts-runtypes';

// A self-referential shape: a node that can point at another Node.
interface Node {
  name: string;
  next?: Node;
}

// A value that points at itself — encoding this without a guard recurses
// until the stack overflows.
const cyclic: {name: string; next?: unknown} = {name: 'a'};
cyclic.next = cyclic;

// start-per-call
// Arm the guard for THIS encoder only. The encoder throws a
// `CircularReferenceError` instead of recursing forever.
const encode = createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});

try {
  encode(cyclic as Node);
} catch (err) {
  err instanceof CircularReferenceError; // true
  (err as CircularReferenceError).path; // ['next'] — where the back-edge was found
}
// end-per-call

// start-global
// Or arm it once globally — every guarded factory (validate, getValidationErrors,
// JSON encoder, binary encoder) checks unless given `{rejectCircularRefs: false}`.
setRejectCircularRefs(true);

const encodeBin = createBinaryEncoder<Node>(); // armed via the global flag
try {
  encodeBin(cyclic as Node);
} catch (err) {
  err instanceof CircularReferenceError; // true
}

setRejectCircularRefs(false); // disarm — back to the default
// end-global

// start-dag
// Shared-but-acyclic values pass — `shared` is reached twice, but never
// through itself, so the guard stays quiet.
const shared: Node = {name: 'shared'};
const dag: Node[] = [
  {name: 'root', next: shared},
  {name: 'alt', next: shared},
];

const encodeList = createJsonEncoder<Node[]>(undefined, {rejectCircularRefs: true});
encodeList(dag); // encodes normally — no cycle
// end-dag

export {encode, encodeBin, encodeList};
