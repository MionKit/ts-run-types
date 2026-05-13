/// <reference path="./runtypes.d.ts" />
export {};
enum Color { Red = "red", Green = "green", Blue = "blue" }
const v: Color = Color.Red;
isType<Color>(v);
