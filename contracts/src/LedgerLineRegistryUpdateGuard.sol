// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetState} from "./interfaces/LedgerLineTypes.sol";
import {LedgerLineRegistry} from "./LedgerLineRegistry.sol";

/// @notice A bounded circuit breaker in front of
/// `LedgerLineRegistry.updateAssetParameters`. Motivated directly by the
/// disclosed limitation in docs/../SECURITY.md ("Registry bounds
/// collateralFactorBps/riskAdjustmentBps... but does not bound price --
/// there is no sanity or deviation check on price updates") and, more
/// concretely, by the September 2026 Bitget breach, where a single
/// compromised backend component was able to push fabricated data
/// straight through an internal approval system with no bound on how far
/// that data could deviate from reality.
///
/// This does NOT solve that class of incident in general -- it does not
/// touch custody, signing, or key management at all, and it does not
/// stop a fully compromised owner key from eventually pushing many small,
/// individually-compliant bad updates. What it does is narrow and
/// concrete: it makes it impossible for a single call -- compromised key,
/// fat-fingered script, or malicious insider -- to move an asset's price
/// further than `maxDeviationBps` in one step, or more often than once
/// per `minUpdateInterval`, and every attempted update (accepted or
/// rejected) is visible on-chain as it happens.
///
/// Deployment model: the Registry owner transfers Registry ownership to
/// an instance of this contract. From then on, Registry's own
/// `updateAssetParameters` is only reachable through this guard's
/// `guardedUpdateAssetParameters`, which validates the step size before
/// forwarding the call. This contract is itself `Ownable` -- the same
/// human who owned Registry before now owns the guard -- so operational
/// control is unchanged, only the update path is constrained.
///
/// Known limitation, disclosed rather than hidden: there is no override
/// path for a legitimate large, one-off move (e.g. a real corporate
/// action / stock split). Handling that correctly needs either a
/// timelocked override or a separate governance step, neither of which
/// is implemented here -- out of scope for what this contract is trying
/// to demonstrate.
contract LedgerLineRegistryUpdateGuard is Ownable {
    LedgerLineRegistry public immutable registry;

    /// @notice Maximum allowed price movement per update, in basis
    /// points of the previous price (10_000 = 100%).
    uint256 public immutable maxDeviationBps;

    /// @notice Minimum time that must elapse between two accepted
    /// updates for the same asset.
    uint256 public immutable minUpdateInterval;

    mapping(uint256 => uint256) public lastUpdateAt;

    event GuardedUpdateApplied(
        uint256 indexed assetId,
        uint256 previousPrice,
        uint256 newPrice,
        uint256 deviationBps
    );

    error AssetNotInitialized(uint256 assetId);
    error PriceDeviationTooLarge(uint256 previousPrice, uint256 attemptedPrice, uint256 deviationBps, uint256 maxDeviationBps);
    error UpdateTooSoon(uint256 assetId, uint256 earliestAllowed, uint256 attemptedAt);

    constructor(address initialOwner, address registryAddress, uint256 maxDeviationBps_, uint256 minUpdateInterval_)
        Ownable(initialOwner)
    {
        registry = LedgerLineRegistry(registryAddress);
        maxDeviationBps = maxDeviationBps_;
        minUpdateInterval = minUpdateInterval_;
    }

    /// @notice The only path to Registry.updateAssetParameters once
    /// Registry ownership has been transferred to this contract. Reverts
    /// if the requested price moves more than `maxDeviationBps` from the
    /// asset's current price, or if called again for the same asset
    /// before `minUpdateInterval` has elapsed since the last accepted
    /// update.
    function guardedUpdateAssetParameters(
        uint256 assetId,
        uint256 price,
        uint256 multiplier,
        uint256 collateralFactorBps,
        uint256 riskAdjustmentBps
    ) external onlyOwner {
        AssetState memory current = registry.getAssetState(assetId);
        if (current.price == 0) revert AssetNotInitialized(assetId);

        uint256 lastUpdate = lastUpdateAt[assetId];
        if (lastUpdate != 0) {
            uint256 earliestAllowed = lastUpdate + minUpdateInterval;
            if (block.timestamp < earliestAllowed) {
                revert UpdateTooSoon(assetId, earliestAllowed, block.timestamp);
            }
        }

        uint256 diff = price > current.price ? price - current.price : current.price - price;
        uint256 deviationBps = (diff * 10_000) / current.price;
        if (deviationBps > maxDeviationBps) {
            revert PriceDeviationTooLarge(current.price, price, deviationBps, maxDeviationBps);
        }

        lastUpdateAt[assetId] = block.timestamp;

        registry.updateAssetParameters(assetId, price, multiplier, collateralFactorBps, riskAdjustmentBps);

        emit GuardedUpdateApplied(assetId, current.price, price, deviationBps);
    }
}
