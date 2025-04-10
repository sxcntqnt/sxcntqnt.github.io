// findMa3.js with Enhanced RNP Implementation
import { removeEmptyDicts, decodePolyline, buildHelixStructure } from './utils.js';

const h3 = window.h3 || { latLngToCell: () => { throw new Error('H3 library not loaded'); } };

let RBush3D = window.RBush3D?.RBush3D;
if (!RBush3D) {
    console.warn('RBush3D not yet loaded from CDN; falling back to basic RBush if available');
    RBush3D = window.RBush || function () { throw new Error('No RBush-3D available'); };
}

// Enhanced RNP configuration with confidence levels and regional adjustments
const RNP_CONFIG = {
    // Default confidence levels (probability of containment)
    confidenceLevels: {
        standard: 0.95,  // 95% containment
        high: 0.999,     // 99.9% containment 
        critical: 0.99999 // 99.999% containment
    },
    // Regional adjustments based on route density
    regionalFactors: {
        urban: 0.8,      // Urban areas can have tighter tolerances due to denser networks
        suburban: 1.0,   // Standard tolerance
        rural: 1.5       // Rural areas need more flexibility due to sparser networks
    },
    // Vertical component settings (in meters)
    verticalRnp: {
        enabled: false,  // Enable when elevation data is available
        defaultValue: 10, // Default vertical RNP in meters
        multiplier: 0.3  // Typically vertical RNP is ~30% of horizontal
    },
    // Error budget allocation (segment portions must sum to <= 1.0)
    errorBudget: {
        pickup: 0.15,    // Allocation for pickup segment
        transfer: 0.25,  // Allocation for transfers between routes
        destination: 0.15, // Allocation for final destination segment
        enroute: 0.45    // Allocation for main route segments
    },
    // Statistical z-scores for different confidence levels
    zScores: {
        0.95: 1.96,
        0.99: 2.576,
        0.999: 3.29,
        0.9999: 3.89,
        0.99999: 4.417
    }
};

// Enhanced class to manage RNP calculations and error budgets
class RnpManager {
    constructor(baseRnpValue, options = {}) {
        this.baseRnpValue = baseRnpValue; // Base RNP in nautical miles
        this.confidenceLevel = options.confidenceLevel || RNP_CONFIG.confidenceLevels.standard;
        this.region = options.region || 'suburban';
        this.enableVertical = options.enableVertical || RNP_CONFIG.verticalRnp.enabled;
        this.verticalRnpValue = options.verticalRnpValue || RNP_CONFIG.verticalRnp.defaultValue;
        this.usedBudget = 0; // Track used error budget (0-1.0)
        this.segmentErrors = []; // Track errors by segment
        
        // Calculate adjusted RNP based on region
        this.regionalFactor = RNP_CONFIG.regionalFactors[this.region] || 1.0;
        
        // Calculate z-score for statistical confidence
        this.zScore = this._getZScore(this.confidenceLevel);
    }
    
    // Get z-score for the confidence level
    _getZScore(confidenceLevel) {
        // Find closest predefined z-score or calculate it
        const exactScore = RNP_CONFIG.zScores[confidenceLevel];
        if (exactScore) return exactScore;
        
        // Find closest predefined level
        const levels = Object.keys(RNP_CONFIG.zScores).map(Number).sort();
        const closestLevel = levels.reduce((prev, curr) => 
            Math.abs(curr - confidenceLevel) < Math.abs(prev - confidenceLevel) ? curr : prev
        );
        return RNP_CONFIG.zScores[closestLevel];
    }
    
    // Get horizontal tolerance in kilometers for a specific segment type
    getHorizontalToleranceKm(segmentType = 'enroute') {
        // Get budget allocation for this segment type
        const budgetAllocation = RNP_CONFIG.errorBudget[segmentType] || RNP_CONFIG.errorBudget.enroute;
        
        // Calculate RNP with regional adjustment and confidence level
        const adjustedRnp = this.baseRnpValue * this.regionalFactor * (this.zScore / 1.96);
        
        // Convert to km and apply budget allocation
        return adjustedRnp * 1.852 * budgetAllocation;
    }
    
    // Get vertical tolerance in meters (if enabled)
    getVerticalToleranceMeters() {
        if (!this.enableVertical) return Infinity;
        return this.verticalRnpValue * this.zScore;
    }
    
    // Check if a point is within tolerance and update budget
    isWithinTolerance(actualDistance, segmentType = 'enroute') {
        const tolerance = this.getHorizontalToleranceKm(segmentType);
        const budgetRequired = actualDistance / (this.baseRnpValue * 1.852);
        
        // Check if we'd exceed our error budget
        if (this.usedBudget + budgetRequired > 1.0) {
            return false;
        }
        
        const result = actualDistance <= tolerance;
        if (result) {
            // Record the used budget
            this.usedBudget += budgetRequired;
            this.segmentErrors.push({
                segmentType,
                distanceKm: actualDistance,
                toleranceKm: tolerance,
                budgetUsed: budgetRequired
            });
        }
        return result;
    }
    
    // Check if we're within vertical tolerance
    isWithinVerticalTolerance(heightDifference) {
        if (!this.enableVertical) return true;
        return Math.abs(heightDifference) <= this.getVerticalToleranceMeters();
    }
    
    // Get remaining error budget as a percentage
    getRemainingBudgetPercent() {
        return (1 - this.usedBudget) * 100;
    }
    
    // Get deviation statistics for reporting
    getDeviationStatistics() {
        if (!this.segmentErrors.length) return null;
        
        return {
            maxDeviation: Math.max(...this.segmentErrors.map(e => e.distanceKm)),
            avgDeviation: this.segmentErrors.reduce((sum, e) => sum + e.distanceKm, 0) / this.segmentErrors.length,
            budgetUsedPercent: this.usedBudget * 100,
            segmentCounts: this.segmentErrors.reduce((acc, err) => {
                acc[err.segmentType] = (acc[err.segmentType] || 0) + 1;
                return acc;
            }, {})
        };
    }
    
    // Reset the budget usage
    resetBudget() {
        this.usedBudget = 0;
        this.segmentErrors = [];
    }
    
    // Determine region type based on point density
    static determineRegionType(points, areaInSqKm) {
        const density = points.length / areaInSqKm;
        if (density > 50) return 'urban';
        if (density > 10) return 'suburban';
        return 'rural';
    }
}

// Utility function for robust coordinate refinement
function refineCoordinates(latLng) {
    if (!latLng) return { lat: NaN, lng: NaN };
    const lat = typeof latLng.latitude === 'function' ? latLng.latitude() : latLng.latitude ?? NaN;
    const lng = typeof latLng.longitude === 'function' ? latLng.longitude() : latLng.longitude ?? NaN;
    return { lat, lng };
}

// Function to index routes using RBush3D
function indexRoutesWithRBush3D(routes) {
    const route3DIndex = new RBush3D();
    const items = routes.flatMap(route => {
        const pickupItems = route.pickup_point?.pickup_latlng && route.pickup_point?.pickup_hexid ? [{
            minX: route.pickup_point.pickup_latlng.latitude,
            minY: route.pickup_point.pickup_latlng.longitude,
            minZ: route.pickup_point.pickup_hexid,
            maxX: route.pickup_point.pickup_latlng.latitude,
            maxY: route.pickup_point.pickup_latlng.longitude,
            maxZ: route.pickup_point.pickup_hexid,
            routeNumber: route.route_number,
            label: route.pickup_point.name || 'Unknown',
            lat: route.pickup_point.pickup_latlng.latitude,
            lng: route.pickup_point.pickup_latlng.longitude,
            elevation: route.pickup_point.elevation // Store elevation if available
        }] : [];

        const destItems = (route.destinations || []).filter(dest => {
            if (!dest.destination_latlng || !dest.destination_hexid) {
                console.warn(`Excluding destination in route ${route.route_number}: Missing or invalid coordinates/hexid`);
                return false;
            }
            return true;
        }).map(dest => ({
            minX: dest.destination_latlng.latitude,
            minY: dest.destination_latlng.longitude,
            minZ: dest.destination_hexid,
            maxX: dest.destination_latlng.latitude,
            maxY: dest.destination_latlng.longitude,
            maxZ: dest.destination_hexid,
            routeNumber: route.route_number,
            label: dest.name || 'Unknown',
            lat: dest.destination_latlng.latitude,
            lng: dest.destination_latlng.longitude,
            elevation: dest.elevation // Store elevation if available
        }));

        return [...pickupItems, ...destItems];
    });

    route3DIndex.load(items);
    console.log(`Indexed ${items.length} points into RBush-3D`);
    return route3DIndex;
}

// Function to calculate the Haversine distance between two points
function haversineDistance(lat1, lng1, lat2, lng2) {
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return Infinity;
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Function to update the centroid of a cluster
function updateCentroid(cluster, h3Resolution) {
    const lats = cluster.points.map(p => p.lat);
    const lngs = cluster.points.map(p => p.lng);
    const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    
    // If elevation data is available, calculate average elevation too
    let avgElevation = undefined;
    const elevations = cluster.points.map(p => p.elevation).filter(e => e !== undefined);
    if (elevations.length > 0) {
        avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;
    }
    
    return {
        lat: avgLat,
        lng: avgLng,
        h3Index: h3.latLngToCell(avgLat, avgLng, h3Resolution),
        elevation: avgElevation
    };
}

// Hierarchical greedy clustering function
function hierarchicalGreedyClustering(route3DIndex, h3Resolution, maxDistanceKm = 1.0, ringSize = 1, minClusters = 10) {
    if (!route3DIndex || typeof h3.latLngToCell !== 'function') return null;

    const routePoints = route3DIndex.all();
    if (!routePoints.length) {
        console.warn('No route points available for clustering');
        return null;
    }

    const clusters = routePoints.flatMap(point => {
        const hexRing = h3.gridDisk(point.minZ, ringSize);
        return hexRing.map(hex => {
            const [lat, lng] = h3.cellToLatLng(hex);
            return {
                points: [{ 
                    lat, 
                    lng, 
                    h3Index: hex, 
                    routeNumber: point.routeNumber, 
                    label: point.label,
                    elevation: point.elevation // Include elevation data
                }],
                centroid: { lat, lng, h3Index: hex, elevation: point.elevation },
                h3Indexes: [hex]
            };
        });
    }).filter(cluster => {
        const { lat, lng } = cluster.centroid;
        return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    });

    if (!clusters.length) {
        console.warn('No valid hex rings generated for clustering');
        return null;
    }

    const clusterIndex = new RBush3D();
    const clusterItems = [];
    
    // Create index mapping from cluster to its index item
    const clusterToItem = new Map();
    
    clusters.forEach((cluster, idx) => {
        const item = {
            minX: cluster.centroid.lat,
            minY: cluster.centroid.lng,
            minZ: idx,
            maxX: cluster.centroid.lat,
            maxY: cluster.centroid.lng,
            maxZ: idx,
            clusterRef: cluster,
            id: idx // Adding unique ID to track items
        };
        clusterItems.push(item);
        clusterToItem.set(cluster, item);
    });
    
    clusterIndex.load(clusterItems);

    const activeClusters = new Set(clusters);
    let nextId = clusters.length; // For creating unique IDs for new clusters
    
    while (activeClusters.size > minClusters) {
        let minDist = Infinity;
        let mergePair = null;

        const clusterArray = Array.from(activeClusters);
        for (let i = 0; i < clusterArray.length; i++) {
            const c1 = clusterArray[i];
            const searchBox = {
                minX: c1.centroid.lat - maxDistanceKm / 110.574,
                minY: c1.centroid.lng - maxDistanceKm / (111.32 * Math.cos(c1.centroid.lat * Math.PI / 180)),
                minZ: 0,
                maxX: c1.centroid.lat + maxDistanceKm / 110.574,
                maxY: c1.centroid.lng + maxDistanceKm / (111.32 * Math.cos(c1.centroid.lat * Math.PI / 180)),
                maxZ: nextId // Use the next ID as the upper bound
            };
            const nearbyItems = clusterIndex.search(searchBox);
            for (const item of nearbyItems) {
                const c2 = item.clusterRef;
                if (c1 === c2 || !activeClusters.has(c2)) continue;

                const roughDist = haversineDistance(c1.centroid.lat, c1.centroid.lng, c2.centroid.lat, c2.centroid.lng);
                if (roughDist > maxDistanceKm) continue;
                const dist = typeof h3.greatCircleDistance === 'function'
                    ? h3.greatCircleDistance([c1.centroid.lat, c1.centroid.lng], [c2.centroid.lat, c2.centroid.lng], 'km')
                    : roughDist;
                    
                // Check vertical separation if elevation data is available
                let verticalSeparation = 0;
                if (c1.centroid.elevation !== undefined && c2.centroid.elevation !== undefined) {
                    verticalSeparation = Math.abs(c1.centroid.elevation - c2.centroid.elevation);
                    // Only consider merging if vertical separation is reasonable
                    if (verticalSeparation > 50) continue; // Skip large vertical differences
                }
                
                if (dist < minDist) {
                    minDist = dist;
                    mergePair = [c1, c2];
                }
            }
        }

        if (minDist > maxDistanceKm || !mergePair) break;

        const [c1, c2] = mergePair;
        const newCluster = {
            points: [...c1.points, ...c2.points],
            h3Indexes: [...c1.h3Indexes, ...c2.h3Indexes]
        };
        newCluster.centroid = updateCentroid(newCluster, h3Resolution);

        // Remove the old clusters from the RBush index
        if (clusterToItem.has(c1)) {
            const item1 = clusterToItem.get(c1);
            clusterIndex.remove(item1);
            clusterToItem.delete(c1);
        }
        
        if (clusterToItem.has(c2)) {
            const item2 = clusterToItem.get(c2);
            clusterIndex.remove(item2);
            clusterToItem.delete(c2);
        }

        // Add the new cluster to RBush index
        const newItem = {
            minX: newCluster.centroid.lat,
            minY: newCluster.centroid.lng,
            minZ: nextId,
            maxX: newCluster.centroid.lat,
            maxY: newCluster.centroid.lng,
            maxZ: nextId,
            clusterRef: newCluster,
            id: nextId
        };
        
        clusterIndex.insert(newItem);
        clusterToItem.set(newCluster, newItem);
        nextId++;

        // Update active clusters
        activeClusters.delete(c1);
        activeClusters.delete(c2);
        activeClusters.add(newCluster);
    }

    const finalClusters = Array.from(activeClusters);
    console.log(`Clustered ${routePoints.length} points into ${finalClusters.length} hierarchical clusters with ${ringSize}-ring H3 hexes (max distance: ${maxDistanceKm} km)`);
    return finalClusters;
}

// Function to format latitude and longitude into DMS
function formatLatLng(lat, lng) {
    const toDMS = (decimal) => {
        const abs = Math.abs(decimal);
        const deg = Math.floor(abs);
        const min = Math.floor((abs - deg) * 60);
        const sec = ((abs - deg - min / 60) * 3600).toFixed(2);
        return `${deg}° ${min}' ${sec}"`;
    };
    return `${toDMS(lat)} ${lat >= 0 ? 'N' : 'S'}, ${toDMS(lng)} ${lng >= 0 ? 'E' : 'W'}`;
}

// Function to find overlapping routes using cluster and 3D index information with enhanced RNP
function findOverlappingRoutes(helixStructure, globalRoutesDAG, routeClusters, route3DIndex) {
    if (!globalRoutesDAG || !routeClusters || !route3DIndex) {
        console.error("Missing globalRoutesDAG, routeClusters, or route3DIndex");
        return { routes: [], userPoints: [], alerts: ["System integrity failure: Missing route data or indexes"] };
    }

    const userPoints = helixStructure.points;
    
    // Create RNP Manager with appropriate settings
    const pointsPerSqKm = userPoints.length / (Math.PI * Math.pow(helixStructure.rnpValue * 1.852, 2));
    const regionType = RnpManager.determineRegionType(
        globalRoutesDAG.non_null_objects.flatMap(r => [r.pickup_point, ...r.destinations]),
        100 // Approximate area in sq km; this could be calculated more precisely
    );
    
    const rnpManager = new RnpManager(helixStructure.rnpValue, {
        confidenceLevel: helixStructure.confidenceLevel || RNP_CONFIG.confidenceLevels.standard,
        region: helixStructure.regionType || regionType,
        enableVertical: helixStructure.elevationData || RNP_CONFIG.verticalRnp.enabled,
        verticalRnpValue: helixStructure.verticalRnpValue || RNP_CONFIG.verticalRnp.defaultValue
    });
    
    // Base tolerance with confident level and regional adjustments
    const toleranceKm = rnpManager.getHorizontalToleranceKm('enroute');
    const lngDelta = toleranceKm / (111.32 * Math.cos(userPoints[0].lat * Math.PI / 180));
    const latDelta = toleranceKm / 110.574;
    const alerts = [];

    // Validate user points and add alerts if needed
    userPoints.forEach(point => {
        if (isNaN(point.lat) || isNaN(point.lng)) {
            alerts.push(`Integrity alert: Invalid coordinates for ${point.label}`);
        }
        if (!point.h3Index || !h3.isValidCell(point.h3Index)) {
            alerts.push(`Integrity alert: Invalid H3 index for ${point.label}`);
        }
    });

    const refinedUserPoints = userPoints.map(point => {
        const refined = refineCoordinates({ lat: point.lat, lng: point.lng });
        return {
            ...point,
            lat: refined.lat,
            lng: refined.lng,
            h3Index: h3.latLngToCell(refined.lat, refined.lng, helixStructure.h3Resolution)
        };
    });

    const segmentCache = new Map();

    const cbdRoute = globalRoutesDAG.non_null_objects.find(r => r.route_number === "0");
    const cbdStops = cbdRoute ? [
        {
            name: cbdRoute.pickup_point.name,
            ...refineCoordinates(cbdRoute.pickup_point.pickup_latlng),
            h3Index: h3.latLngToCell(cbdRoute.pickup_point.pickup_latlng.latitude, cbdRoute.pickup_point.pickup_latlng.longitude, helixStructure.h3Resolution),
            elevation: cbdRoute.pickup_point.elevation
        },
        ...cbdRoute.destinations.map(d => ({
            name: d.name,
            ...refineCoordinates(d.destination_latlng),
            h3Index: h3.latLngToCell(d.destination_latlng.latitude, d.destination_latlng.longitude, helixStructure.h3Resolution),
            elevation: d.elevation
        }))
    ] : [];
    if (!cbdStops.length) console.warn("No CBD stops found in Route 0.");

    const routeCandidates = new Set();
    refinedUserPoints.forEach(point => {
        // Use RNP manager to get appropriate tolerance for this segment type
        const pickupToleranceKm = rnpManager.getHorizontalToleranceKm('pickup');
        
        const nearbyClusters = routeClusters.filter(cluster => {
            const dist = h3.greatCircleDistance([point.lat, point.lng], [cluster.centroid.lat, cluster.centroid.lng], 'km');
            // Check vertical tolerance if elevation data is available
            let withinVertical = true;
            if (point.elevation !== undefined && cluster.centroid.elevation !== undefined) {
                withinVertical = rnpManager.isWithinVerticalTolerance(point.elevation - cluster.centroid.elevation);
            }
            return dist <= pickupToleranceKm && withinVertical;
        });
        nearbyClusters.forEach(cluster => cluster.points.forEach(p => routeCandidates.add(p.routeNumber)));
    });
    console.log('Route Candidates (Hierarchical Clusters):', [...routeCandidates]);

    const routeCandidates3D = new Set();
    refinedUserPoints.forEach(point => {
        const pickupToleranceKm = rnpManager.getHorizontalToleranceKm('pickup');
        const lngDelta = pickupToleranceKm / (111.32 * Math.cos(point.lat * Math.PI / 180));
        const latDelta = pickupToleranceKm / 110.574;
        
        const searchBox = {
            minX: point.lat - latDelta,
            minY: point.lng - lngDelta,
            minZ: point.h3Index,
            maxX: point.lat + latDelta,
            maxY: point.lng + lngDelta,
            maxZ: point.h3Index
        };
        const matches = route3DIndex.search(searchBox);
        
        // Add vertical filtering if elevation data exists
        const filteredMatches = point.elevation !== undefined
            ? matches.filter(match => {
                if (match.elevation === undefined) return true;
                return rnpManager.isWithinVerticalTolerance(point.elevation - match.elevation);
            })
            : matches;
            
        filteredMatches.forEach(match => routeCandidates3D.add(match.routeNumber));
    });
    console.log('3D Route Candidates:', [...routeCandidates3D]);

    const routeGraph = new Map();
    const allRoutes = globalRoutesDAG.non_null_objects;
    allRoutes.forEach(route => {
        if (route.route_number) routeGraph.set(route.route_number, new Set());
    });

    const routePointsIndex = new RBush3D();
    routePointsIndex.load(allRoutes.flatMap(route => {
        const points = [
            { 
                lat: route.pickup_point.pickup_latlng.latitude, 
                lng: route.pickup_point.pickup_latlng.longitude, 
                routeNumber: route.route_number,
                elevation: route.pickup_point.elevation 
            },
            ...route.destinations.map(d => ({ 
                lat: d.destination_latlng.latitude, 
                lng: d.destination_latlng.longitude, 
                routeNumber: route.route_number,
                elevation: d.elevation
            }))
        ];
        return points.map(p => ({
            minX: p.lat, minY: p.lng, minZ: 0,
            maxX: p.lat, maxY: p.lng, maxZ: 0,
            routeNumber: p.routeNumber,
            lat: p.lat,
            lng: p.lng,
            elevation: p.elevation
        }));
    }));

    allRoutes.forEach(route => {
        if (!route.route_number) return;
        const routePoints = routePointsIndex.search({
            minX: -90, minY: -180, minZ: 0,
            maxX: 90, maxY: 180, maxZ: Infinity
        }).filter(item => item.routeNumber === route.route_number);

        routePoints.forEach(p => {
            const enrouteToleranceKm = rnpManager.getHorizontalToleranceKm('enroute');
            const searchBox = {
                minX: p.lat - enrouteToleranceKm / 110.574,
                minY: p.lng - enrouteToleranceKm / (111.32 * Math.cos(p.lat * Math.PI / 180)),
                minZ: 0,
                maxX: p.lat + enrouteToleranceKm / 110.574,
                maxY: p.lng + enrouteToleranceKm / (111.32 * Math.cos(p.lat * Math.PI / 180)),
                maxZ: Infinity
            };
            const nearbyPoints = routePointsIndex.search(searchBox);
            nearbyPoints.forEach(np => {
                if (np.routeNumber !== route.route_number) {
                    const dist = h3.greatCircleDistance([p.lat, p.lng], [np.lat, np.lng], 'km');
                    
                    // Check vertical tolerance if elevation data is available
                    let withinVertical = true;
                    if (p.elevation !== undefined && np.elevation !== undefined) {
                        withinVertical = rnpManager.isWithinVerticalTolerance(p.elevation - np.elevation);
                    }
                    
                    if (dist < enrouteToleranceKm && withinVertical) {
                        routeGraph.get(route.route_number).add(np.routeNumber);
                        routeGraph.get(np.routeNumber).add(route.route_number);
                    }
                }
            });
        });
    });
    console.log('Route Graph:', Array.from(routeGraph.entries()).map(([r, neighbors]) => `${r}: ${Array.from(neighbors)}`));

    const finalRouteCandidates = new Set([...routeCandidates].filter(x => routeCandidates3D.has(x)));
    const expandedCandidates = new Set(finalRouteCandidates);
    finalRouteCandidates.forEach(routeNum => {
        routeGraph.get(routeNum)?.forEach(neighbor => expandedCandidates.add(neighbor));
    });
    console.log('Final Route Candidates (Clusters ∩ 3D + Graph):', [...expandedCandidates]);

    const stringSimilarity = (s1, s2, threshold = 0.75) => {
        s1 = (s1 || '').toLowerCase().trim();
        s2 = (s2 || '').toLowerCase().trim();
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;
        const costs = new Array(s1.length + 1).fill(null).map(() => new Array(s2.length + 1).fill(0));
        for (let i = 0; i <= s1.length; i++) costs[i][0] = i;
        for (let j = 1; j <= s2.length; j++) costs[0][j] = j;
        for (let i = 1; i <= s1.length; i++) {
            for (let j = 1; j <= s2.length; j++) {
                costs[i][j] = s1[i - 1] === s2[j - 1]
                    ? costs[i - 1][j - 1]
                    : Math.min(costs[i - 1][j], costs[i][j - 1], costs[i - 1][j - 1]) + 1;
            }
        }
