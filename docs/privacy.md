# Privacy

Back to the [README](../README.md).

The payer's name and address live only for the request. Nothing is stored, and logs hold method, path, status and duration only. There are no request bodies in the logs, and there is no database. The one exception is a **subscription** ([#20](https://github.com/Le-Space/eigenbeleg-agent/issues/20)), which the API has to keep for a year: chain, network, addresses, payer (with the logo, if one was sent), e-mail address and options, encrypted on disk, deleted after the last statement or on the cancel link; log lines name its id only. The other is a **logo sent with the free preview**: kept encrypted for 24 hours under a random id only the caller has, then deleted by an hourly sweep.

**In the web UI** nothing reaches this API: the page reads, values and draws in the browser, and asks only the data sources it lists (its Content-Security-Policy allows no other host). Name and postal address never leave the page. The free preview takes no name or address at all. Fixtures are public chain data of protocol accounts; every name and address in examples is made up (*Wolkenfabrik Hosting GmbH*, *Musterstraße 1*).

## What your browser asks

Your browser asks NearBlocks and the FastNEAR archival RPC (NEAR), PublicNode and, through our [Akash CORS proxy](../deploy/akash-proxy) when it is set up, the Akash Console indexer (Akash), Filfox (Filecoin), the Filecoin Pay index at Goldsky and Blockscout (Filecoin Pay), the Aleph API (Aleph Cloud), public ElectrumX servers of the Doichain network at doi.works (Doichain), mempool.space (Bitcoin), and Kraken, CoinGecko and the ECB (rates; for documents in RUB the Bank of Russia, www.cbr.ru). They see your IP address and, except the rate services, the addresses you enter. **Ethereum and Base** need your own Alchemy key (free at alchemy.com), entered under *Ethereum und Base* in the form: it goes from your browser to Alchemy only, never to us, and is kept on your device only if you tick its *merken* ([#25](https://github.com/Le-Space/eigenbeleg-agent/issues/25)). Very busy NEAR accounts can hit NearBlocks' free rate limit; the page then says so and you try a shorter period or later, or enter your own NearBlocks key under *NEAR: eigener NearBlocks-Schlüssel*, which goes to NearBlocks only.

The full table, with what each host learns: [web-ui.md](web-ui.md#what-the-browser-asks). The hosts the API calls: [deploy.md](deploy.md#outbound-hosts).
