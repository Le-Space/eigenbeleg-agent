# Where NEAR comes in

Back to the [README](../README.md).

- **Payment rail**: x402 `exact` on NEAR. A NEP-366 meta transaction carries one NEP-141 USDC `ft_transfer`; a relayer pays the gas, so the paying agent holds only USDC. The USDC settles to a plain NEAR account in one transaction, which the receipt links.
- **Data**: the NEAR building block reads any account through the NearBlocks API, both native NEAR and NEP-141 tokens, as exact base units, never through a float.
- **Mainnet path**: PingPay Agent Pay lets agents pay from Base and other chains, settling to NEAR through NEAR Intents.
- **AI**: optional notes from NEAR AI Cloud when the agent drafts a missing block.
