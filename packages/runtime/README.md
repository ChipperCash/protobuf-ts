@chippercash/protobuf-runtime
====================

Runtime library for code generated by [protobuf-ts](https://github.com/timostamm/protobuf-ts/).

Create, clone, serialize, and compare protobuf messages. Get reflection 
information about message fields and custom options.

Installation:

```shell script
# with npm:
npm install @chippercash/protobuf-runtime

# with yarn:
yarn add @chippercash/protobuf-runtime
```             

You probably want the protoc plugin as well: 
          
```shell script
# with npm:
npm install -D @chippercash/protobuf-plugin

# with yarn:
yarn add --dev @chippercash/protobuf-plugin
```
                       

To learn more, please read the [MANUAL](https://github.com/timostamm/protobuf-ts/blob/master/MANUAL.md#imessagetype) 
or check the repository [README](https://github.com/timostamm/protobuf-ts/README.md) for a quick overview.


### Copyright

- The [code to decode UTF8](https://github.com/timostamm/protobuf-ts/blob/master/packages/runtime/src/protobufjs-utf8.ts) is Copyright 2016 by Daniel Wirtz, licensed under BSD-3-Clause.
- The [code to encode and decode varint](https://github.com/timostamm/protobuf-ts/blob/master/packages/runtime/src/goog-varint.ts) is Copyright 2008 Google Inc., licensed under BSD-3-Clause.
- All other files are licensed under Apache-2.0, see [LICENSE](https://github.com/timostamm/protobuf-ts/blob/master/packages/runtime/LICENSE). 
