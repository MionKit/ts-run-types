/// <reference path="./runtypes.d.ts" />
export {};
enum Color { Red = 0, Green = 1, Blue = 2 }
const v: Color = Color.Red;
isType<Color>(v);
