// SPDX-License-Identifier: AGPL-3.0-or-later
// The pipeline both front ends run: the API for agents (Node) and the web UI
// (browser). Every call to the outside goes through the `fetch` and the
// endpoints handed in, so each side decides where requests go.
export { RequestError, parseRequest } from './request.js';
export { generate } from './generate.js';
export { BLOCKS, checkBlock, describeBlocks } from './blocks.js';
