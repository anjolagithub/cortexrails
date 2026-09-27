// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LedgerLineRegistry} from "../src/LedgerLineRegistry.sol";
import {LedgerLineRegistryUpdateGuard} from "../src/LedgerLineRegistryUpdateGuard.sol";
import {LifecycleState} from "../src/interfaces/LedgerLineTypes.sol";

/// @notice Covers LedgerLineRegistryUpdateGuard -- the bounded circuit
/// breaker in front of Registry.updateAssetParameters, added in response
/// to the disclosed "no price sanity/deviation check" limitation and the
/// September 2026 Bitget breach (a single compromised backend component
/// pushing unbounded fabricated data through an internal approval path).
contract LedgerLineRegistryUpdateGuardTest is Test {
    LedgerLineRegistry registry;
    LedgerLineRegistryUpdateGuard guard;

    address owner = address(0xA11CE);
    uint256 constant ASSET_ID = 1;
    uint256 constant INITIAL_PRICE = 400e18;
    uint256 constant MAX_DEVIATION_BPS = 2_000; // 20%
    uint256 constant MIN_INTERVAL = 1 hours;

    function setUp() public {
        vm.startPrank(owner);
        registry = new LedgerLineRegistry(owner);
        registry.initializeAsset(ASSET_ID, INITIAL_PRICE, 1e18, 7_000, 8_000);

        guard = new LedgerLineRegistryUpdateGuard(owner, address(registry), MAX_DEVIATION_BPS, MIN_INTERVAL);
        registry.transferOwnership(address(guard));
        vm.stopPrank();
    }

    function test_registryDirectCallNowRejected() public {
        // Once ownership has moved to the guard, Registry itself no
        // longer accepts calls from the original EOA -- the guard is
        // the only path, exactly as intended.
        vm.prank(owner);
        vm.expectRevert();
        registry.updateAssetParameters(ASSET_ID, 410e18, 1e18, 7_000, 8_000);
    }

    function test_smallMoveWithinBoundsSucceeds() public {
        // 5% move, well within the 20% bound.
        uint256 newPrice = (INITIAL_PRICE * 105) / 100;

        vm.prank(owner);
        guard.guardedUpdateAssetParameters(ASSET_ID, newPrice, 1e18, 7_000, 8_000);

        assertEq(registry.getAssetState(ASSET_ID).price, newPrice);
    }

    function test_extremeMoveBeyondBoundsReverts() public {
        // A 50% jump in a single call -- exactly the kind of unbounded,
        // single-step corruption the guard exists to stop.
        uint256 maliciousPrice = INITIAL_PRICE / 2;

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                LedgerLineRegistryUpdateGuard.PriceDeviationTooLarge.selector,
                INITIAL_PRICE,
                maliciousPrice,
                5_000,
                MAX_DEVIATION_BPS
            )
        );
        guard.guardedUpdateAssetParameters(ASSET_ID, maliciousPrice, 1e18, 7_000, 8_000);

        // State is untouched -- the attempted corruption never landed.
        assertEq(registry.getAssetState(ASSET_ID).price, INITIAL_PRICE);
    }

    function test_exactlyAtBoundarySucceeds() public {
        // Exactly 20% up is the boundary -- should be accepted, not
        // rejected (deviationBps > max, not >=).
        uint256 boundaryPrice = (INITIAL_PRICE * 12_000) / 10_000;

        vm.prank(owner);
        guard.guardedUpdateAssetParameters(ASSET_ID, boundaryPrice, 1e18, 7_000, 8_000);

        assertEq(registry.getAssetState(ASSET_ID).price, boundaryPrice);
    }

    function test_secondUpdateTooSoonReverts() public {
        vm.startPrank(owner);
        guard.guardedUpdateAssetParameters(ASSET_ID, (INITIAL_PRICE * 105) / 100, 1e18, 7_000, 8_000);

        vm.expectRevert(
            abi.encodeWithSelector(
                LedgerLineRegistryUpdateGuard.UpdateTooSoon.selector,
                ASSET_ID,
                block.timestamp + MIN_INTERVAL,
                block.timestamp
            )
        );
        guard.guardedUpdateAssetParameters(ASSET_ID, (INITIAL_PRICE * 106) / 100, 1e18, 7_000, 8_000);
        vm.stopPrank();
    }

    function test_updateAfterIntervalElapsedSucceeds() public {
        vm.startPrank(owner);
        guard.guardedUpdateAssetParameters(ASSET_ID, (INITIAL_PRICE * 105) / 100, 1e18, 7_000, 8_000);

        vm.warp(block.timestamp + MIN_INTERVAL);
        guard.guardedUpdateAssetParameters(ASSET_ID, (INITIAL_PRICE * 105 * 105) / 10_000, 1e18, 7_000, 8_000);
        vm.stopPrank();
    }

    function test_onlyGuardOwnerCanCallGuardedUpdate() public {
        address attacker = address(0xBADD00D);
        vm.prank(attacker);
        vm.expectRevert();
        guard.guardedUpdateAssetParameters(ASSET_ID, INITIAL_PRICE, 1e18, 7_000, 8_000);
    }

    function test_uninitializedAssetReverts() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(LedgerLineRegistryUpdateGuard.AssetNotInitialized.selector, uint256(999))
        );
        guard.guardedUpdateAssetParameters(999, 100e18, 1e18, 7_000, 8_000);
    }

    function testFuzz_deviationNeverExceedsBoundWhenAccepted(uint256 priceDelta, bool increase) public {
        priceDelta = bound(priceDelta, 0, INITIAL_PRICE * 2);
        uint256 attemptedPrice = increase ? INITIAL_PRICE + priceDelta : (priceDelta >= INITIAL_PRICE ? 0 : INITIAL_PRICE - priceDelta);
        vm.assume(attemptedPrice > 0);

        uint256 diff = attemptedPrice > INITIAL_PRICE ? attemptedPrice - INITIAL_PRICE : INITIAL_PRICE - attemptedPrice;
        uint256 deviationBps = (diff * 10_000) / INITIAL_PRICE;

        vm.prank(owner);
        if (deviationBps > MAX_DEVIATION_BPS) {
            vm.expectRevert();
            guard.guardedUpdateAssetParameters(ASSET_ID, attemptedPrice, 1e18, 7_000, 8_000);
            assertEq(registry.getAssetState(ASSET_ID).price, INITIAL_PRICE);
        } else {
            guard.guardedUpdateAssetParameters(ASSET_ID, attemptedPrice, 1e18, 7_000, 8_000);
            assertEq(registry.getAssetState(ASSET_ID).price, attemptedPrice);
        }
    }
}
