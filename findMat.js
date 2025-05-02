import { removeEmptyDicts, decodePolyline, buildHelixStructure } from './utils.js';

const DEFAULT_CONFIG = {
  maxDistanceKm: 1.0,
  ringSize: 1,
  minClusters: 10,
  h3Resolution: 9,
  similarityThreshold: 0.75
};

const ErrorSeverity = {
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

function handleError(message, severity, context = {}) {
  if (severity === ErrorSeverity.CRITICAL) {
    alerts.push(message);
  }
  console[severity === ErrorSeverity.WARNING ? 'warn' : 'error'](message, context);
}

const h3 = window.h3 || { latLngToCell: () => { throw new Error('H3 library not loaded'); } };

let RBush3D = window.RBush3D?.RBush3D;
if (!RBush3D) {
    console.warn('RBush3D not yet loaded from CDN; falling back to basic RBush if available');
    RBush3D = window.RBush || function () { throw new Error('No RBush-3D available'); };
}

// RNP configuration (adapted from original context)
const RNP_CONFIG = {
    confidenceLevels: { standard: 0.95, high: 0.999, critical: 0.99999 },
    regionalFactors: { urban: 0.8, suburban: 1.0, rural: 1.5 },
    verticalRnp: { enabled: false, defaultValue: 10, multiplier: 0.3 },
    errorBudget: { pickup: 0.15, transfer: 0.25, destination: 0.15, enroute: 0.45 },
    zScores: { 0.95: 1.96, 0.99: 2.576, 0.999: 3.29, 0.9999: 3.89, 0.99999: 4.417 }
};

// RnpManager class (adapted from original context)
class RnpManager {
    constructor(baseRnpValue, options = {}) {
        this.baseRnpValue = baseRnpValue;
        this.confidenceLevel = options.confidenceLevel || RNP_CONFIG.confidenceLevels.standard;
        this.region = options.region || 'suburban';
        this.enableVertical = options.enableVertical || RNP_CONFIG.verticalRnp.enabled;
        this.verticalRnpValue = options.verticalRnpValue || RNP_CONFIG.verticalRnp.defaultValue;
        this.usedBudget = 0;
        this.segmentErrors = [];
        this.regionalFactor = RNP_CONFIG.regionalFactors[this.region] || 1.0;
        this.zScore = this._getZScore(this.confidenceLevel);
    }

    _getZScore(confidenceLevel) {
        const exactScore = RNP_CONFIG.zScores[confidenceLevel];
        if (exactScore) return exactScore;
        const levels = Object.keys(RNP_CONFIG.zScores).map(Number).sort();
        const closestLevel = levels.reduce((prev, curr) => 
            Math.abs(curr - confidenceLevel) < Math.abs(prev - confidenceLevel) ? curr : prev
        );
        return RNP_CONFIG.zScores[closestLevel];
    }

    getHorizontalToleranceKm(segmentType = 'enroute') {
        const budgetAllocation = RNP_CONFIG.errorBudget[segmentType] || RNP_CONFIG.errorBudget.enroute;
        const adjustedRnp = this.baseRnpValue * this.regionalFactor * (this.zScore / 1.96);
        return adjustedRnp * 1.852 * budgetAllocation;
    }

    getVerticalToleranceMeters() {
        if (!this.enableVertical) return Infinity;
        return this.verticalRnpValue * this.zScore;
    }

    isWithinTolerance(actualDistance, segmentType = 'enroute') {
        const tolerance = this.getHorizontalToleranceKm(segmentType);
        const budgetRequired = actualDistance / (this.baseRnpValue * 1.852);
        if (this.usedBudget + budgetRequired > 1.0) return false;
        const result = actualDistance <= tolerance;
        if (result) {
            this.usedBudget += budgetRequired;
            this.segmentErrors.push({ segmentType, distanceKm: actualDistance, toleranceKm: tolerance, budgetUsed: budgetRequired });
        }
        return result;
    }

    isWithinVerticalTolerance(heightDifference) {
        if (!this.enableVertical) return true;
        return Math.abs(heightDifference) <= this.getVerticalToleranceMeters();
    }

    getRemainingBudgetPercent() {
        return (1 - this.usedBudget) * 100;
    }

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

    resetBudget() {
        this.usedBudget = 0;
        this.segmentErrors = [];
    }

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
            lng: route.pickup_point.pickup_latlng.longitude
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
            lng: dest.destination_latlng.longitude
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
    return {
        lat: avgLat,
        lng: avgLng,
        h3Index: h3.latLngToCell(avgLat, avgLng, h3Resolution)
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
                points: [{ lat, lng, h3Index: hex, routeNumber: point.routeNumber, label: point.label }],
                centroid: { lat, lng, h3Index: hex },
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
            id: idx
        };
        clusterItems.push(item);
        clusterToItem.set(cluster, item);
    });

    clusterIndex.load(clusterItems);

    const activeClusters = new Set(clusters);
    let nextId = clusters.length;

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
                maxZ: nextId
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

// Hierholzer’s algorithm for Eulerian Path
function findEulerianPath(graph) {
    if (!graph.size) return [];

    // Count degrees and find start vertex
    const degrees = new Map();
    graph.forEach((neighbors, vertex) => {
        degrees.set(vertex, neighbors.size);
    });

    const oddDegrees = Array.from(degrees.entries()).filter(([_, deg]) => deg % 2 !== 0);
    if (oddDegrees.length > 2) {
        console.warn('Graph is not Eulerian; using greedy approximation');
        return approximateEulerianPath(graph);
    }

    const startVertex = oddDegrees.length ? oddDegrees[0][0] : graph.keys().next().value;
    const path = [];
    const stack = [startVertex];
    const tempGraph = new Map(graph.entries().map(([k, v]) => [k, new Set(v)]));

    while (stack.length) {
        const current = stack[stack.length - 1];
        const neighbors = tempGraph.get(current);

        if (neighbors && neighbors.size) {
            const nextVertex = neighbors.values().next().value;
            neighbors.delete(nextVertex);
            tempGraph.get(nextVertex).delete(current);
            stack.push(nextVertex);
        } else {
            path.push(stack.pop());
        }
    }

    // Reverse path to get correct order
    return path.reverse();
}

// Greedy approximation for non-Eulerian graphs
function approximateEulerianPath(graph) {
    const path = [];
    const visitedEdges = new Set();
    const tempGraph = new Map(graph.entries().map(([k, v]) => [k, new Set(v)]));
    let current = graph.keys().next().value;

    while (tempGraph.size) {
        path.push(current);
        const neighbors = tempGraph.get(current);
        if (!neighbors || !neighbors.size) {
            tempGraph.delete(current);
            if (path.length > 1) {
                current = path[path.length - 2];
            } else if (tempGraph.size) {
                current = tempGraph.keys().next().value;
            }
            continue;
        }

        let nextVertex = null;
        let minDist = Infinity;
        for (const neighbor of neighbors) {
            const edgeKey = `${Math.min(current, neighbor)}-${Math.max(current, neighbor)}`;
            if (!visitedEdges.has(edgeKey)) {
                minDist = 0; // Prioritize unvisited edges
                nextVertex = neighbor;
                break;
            }
        }

        if (!nextVertex) {
            nextVertex = neighbors.values().next().value;
        }

        const edgeKey = `${Math.min(current, nextVertex)}-${Math.max(current, nextVertex)}`;
        visitedEdges.add(edgeKey);
        neighbors.delete(nextVertex);
        tempGraph.get(nextVertex).delete(current);
        current = nextVertex;
    }

    return path;
}

// Find transfer points between two routes
function findTransferPoints(fromRoute, toRoute, routePointsIndex, rnpManager, toleranceKm) {
    const fromPoints = routePointsIndex.search({
        minX: -90, minY: -180, minZ: 0,
        maxX: 90, maxY: 180, maxZ: Infinity
    }).filter(item => item.routeNumber === fromRoute);

    const toPoints = routePointsIndex.search({
        minX: -90, minY: -180, minZ: 0,
        maxX: 90, maxY: 180, maxZ: Infinity
    }).filter(item => item.routeNumber === toRoute);

    const transferPoints = [];
    for (const fromPoint of fromPoints) {
        for (const toPoint of toPoints) {
            const dist = h3.greatCircleDistance([fromPoint.lat, fromPoint.lng], [toPoint.lat, toPoint.lng], 'km');
            if (rnpManager.isWithinTolerance(dist, 'transfer')) {
                transferPoints.push({
                    from: { lat: fromPoint.lat, lng: fromPoint.lng, name: fromPoint.label || 'Transfer Point' },
                    to: { lat: toPoint.lat, lng: toPoint.lng, name: toPoint.label || 'Transfer Point' },
                    distanceKm: dist
                });
            }
        }
    }

    return transferPoints.sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

// Enhanced findOverlappingRoutes with Eulerian Path
function findOverlappingRoutes(helixStructure, globalRoutesDAG, routeClusters, route3DIndex) {
    if (!globalRoutesDAG || !routeClusters || !route3DIndex) {
        console.error("Missing globalRoutesDAG, routeClusters, or route3DIndex");
        return { routes: [], userPoints: [], alerts: ["System integrity failure: Missing route data or indexes"] };
    }

    const userPoints = helixStructure.points;
    const alerts = [];

    // Initialize RnpManager
    const pointsPerSqKm = userPoints.length / (Math.PI * Math.pow(helixStructure.rnpValue * 1.852, 2));
    const regionType = RnpManager.determineRegionType(
        globalRoutesDAG.non_null_objects.flatMap(r => [r.pickup_point, ...r.destinations]),
        100
    );
    const rnpManager = new RnpManager(helixStructure.rnpValue, {
        confidenceLevel: RNP_CONFIG.confidenceLevels.standard,
        region: regionType,
        enableVertical: RNP_CONFIG.verticalRnp.enabled,
        verticalRnpValue: RNP_CONFIG.verticalRnp.defaultValue
    });

    const toleranceKm = rnpManager.getHorizontalToleranceKm('enroute');
    const lngDelta = toleranceKm / (111.32 * Math.cos(userPoints[0].lat * Math.PI / 180));
    const latDelta = toleranceKm / 110.574;

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
            h3Index: h3.latLngToCell(cbdRoute.pickup_point.pickup_latlng.latitude, cbdRoute.pickup_point.pickup_latlng.longitude, helixStructure.h3Resolution)
        },
        ...cbdRoute.destinations.map(d => ({
            name: d.name,
            ...refineCoordinates(d.destination_latlng),
            h3Index: h3.latLngToCell(d.destination_latlng.latitude, d.destination_latlng.longitude, helixStructure.h3Resolution)
        }))
    ] : [];
    if (!cbdStops.length) console.warn("No CBD stops found in Route 0.");

    const routeCandidates = new Set();
    refinedUserPoints.forEach(point => {
        const pickupToleranceKm = rnpManager.getHorizontalToleranceKm('pickup');
        const nearbyClusters = routeClusters.filter(cluster => {
            const dist = h3.greatCircleDistance([point.lat, point.lng], [cluster.centroid.lat, cluster.centroid.lng], 'km');
            return dist <= pickupToleranceKm;
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
        matches.forEach(match => routeCandidates3D.add(match.routeNumber));
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
            { lat: route.pickup_point.pickup_latlng.latitude, lng: route.pickup_point.pickup_latlng.longitude, routeNumber: route.route_number, label: route.pickup_point.name },
            ...route.destinations.map(d => ({ lat: d.destination_latlng.latitude, lng: d.destination_latlng.longitude, routeNumber: route.route_number, label: d.name }))
        ];
        return points.map(p => ({
            minX: p.lat, minY: p.lng, minZ: 0,
            maxX: p.lat, maxY: p.lng, maxZ: 0,
            routeNumber: p.routeNumber,
            lat: p.lat,
            lng: p.lng,
            label: p.label
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
                    if (rnpManager.isWithinTolerance(dist, 'transfer')) {
                        routeGraph.get(route.route_number).add(np.routeNumber);
                        routeGraph.get(np.routeNumber).add(route.route_number);
                    }
                }
            });
        });
    });
    console.log('Route Graph:', Array.from(routeGraph.entries()).map(([r, neighbors]) => `${r}: ${Array.from(neighbors)}`));

    // Compute Eulerian Path for transfer optimization
    const eulerianPath = findEulerianPath(routeGraph);
    console.log('Eulerian Path for Transfers:', eulerianPath);

    // Generate transfer sequence from Eulerian Path
    const transferSequence = [];
    for (let i = 0; i < eulerianPath.length - 1; i++) {
        const fromRoute = eulerianPath[i];
        const toRoute = eulerianPath[i + 1];
        const transfer = findTransferPoints(fromRoute, toRoute, routePointsIndex, rnpManager, toleranceKm);
        if (transfer) {
            transferSequence.push({
                fromRoute,
                toRoute,
                transferPoint: transfer.from.name,
                distanceKm: transfer.distanceKm,
                from: transfer.from,
                to: transfer.to
            });
        }
    }
    console.log('Transfer Sequence:', transferSequence);

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
        return (longerLength - costs[s1.length][s2.length]) / longerLength >= threshold;
    };

    const findRouteSegment = (startPoint, endPoint, allRoutes, requireEndMatch = false, fallbackToleranceKm = toleranceKm) => {
        const cacheKey = `${startPoint.label}-${endPoint.label}-${requireEndMatch}-${fallbackToleranceKm}`;
        if (segmentCache.has(cacheKey)) return segmentCache.get(cacheKey);

        const segmentRoutes = [];
        const seenRoutes = new Set();

        allRoutes.forEach(route => {
            if (!expandedCandidates.has(route.route_number)) return;

            const pickup = route.pickup_point;
            const destinations = Array.isArray(route.destinations) ? route.destinations : [];
            if (!pickup?.name || !destinations.length) {
                alerts.push(`Integrity alert: Incomplete data for route ${route.route_number}`);
                return;
            }

            const allPoints = [
                { name: pickup.name, ...refineCoordinates(pickup.pickup_latlng), h3Index: h3.latLngToCell(pickup.pickup_latlng.latitude, pickup.pickup_latlng.longitude, helixStructure.h3Resolution) },
                ...destinations.map(d => ({ name: d.name, ...refineCoordinates(d.destination_latlng), h3Index: h3.latLngToCell(d.destination_latlng.latitude, d.destination_latlng.longitude, helixStructure.h3Resolution) }))
            ];

            const startMatch = allPoints.find(p => stringSimilarity(startPoint.label, p.name) &&
                h3.greatCircleDistance([startPoint.lat, startPoint.lng], [p.lat, p.lng], 'km') < fallbackToleranceKm &&
                h3.gridDistance(startPoint.h3Index, p.h3Index) <= 1);
            if (!startMatch) return;

            const endMatch = requireEndMatch ? allPoints.find(p => stringSimilarity(endPoint.label, p.name) &&
                h3.greatCircleDistance([endPoint.lat, endPoint.lng], [p.lat, p.lng], 'km') < fallbackToleranceKm &&
                h3.gridDistance(endPoint.h3Index, p.h3Index) <= 1) : null;

            if (startMatch && endMatch) {
                const actualDistance = h3.greatCircleDistance([startPoint.lat, startPoint.lng], [startMatch.lat, startMatch.lng], 'km');
                if (!rnpManager.isWithinTolerance(actualDistance, 'enroute')) {
                    alerts.push(`Integrity alert: Route ${route.route_number} exceeds tolerance (${actualDistance.toFixed(2)} km > ${fallbackToleranceKm} km)`);
                }
            }

            const startIdx = allPoints.findIndex(p => p.name === startMatch.name);
            const endIdx = endMatch ? allPoints.findIndex(p => p.name === endMatch.name) : allPoints.length - 1;
            const direction = startIdx <= endIdx ? 'forward' : 'reverse';

            const stops = direction === 'forward'
                ? allPoints.slice(startIdx, endIdx + 1)
                : allPoints.slice(endIdx, startIdx + 1).reverse();

            const routeDetails = {
                routeNumber: route.route_number,
                start: startMatch.name,
                end: endMatch ? endMatch.name : stops[stops.length - 1].name,
                stops: stops.map(p => ({ name: p.name, lat: p.lat, lng: p.lng, h3Index: p.h3Index })),
                direction,
                segment: `${startPoint.label} to ${endPoint.label}`
            };

            if (!seenRoutes.has(route.route_number) && routeDetails.start !== routeDetails.end) {
                seenRoutes.add(route.route_number);
                segmentRoutes.push(routeDetails);
            }
        });

        if (!segmentRoutes.length && fallbackToleranceKm < 30) {
            console.warn(`Fallback: Increasing tolerance to ${fallbackToleranceKm * 2} km`);
            return findRouteSegment(startPoint, endPoint, allRoutes, requireEndMatch, fallbackToleranceKm * 2);
        }

        segmentCache.set(cacheKey, segmentRoutes);
        return segmentRoutes;
    };

    const findTransferRoutes = (startPoint, endPoint, allRoutes) => {
        const startRoutes = findRouteSegment(startPoint, startPoint, allRoutes);
        const endRoutes = findRouteSegment(endPoint, endPoint, allRoutes);
        if (!startRoutes.length || !endRoutes.length) return null;

        const transferCandidates = [];
        startRoutes.forEach(startRoute => {
            endRoutes.forEach(endRoute => {
                startRoute.stops.forEach(startStop => {
                    endRoute.stops.forEach(endStop => {
                        const distance = h3.greatCircleDistance([startStop.lat, startStop.lng], [endStop.lat, endStop.lng], 'km');
                        const h3Distance = h3.gridDistance(startStop.h3Index, endStop.h3Index);
                        if (rnpManager.isWithinTolerance(distance, 'transfer') && h3Distance <= 1 && startStop.name !== endStop.name) {
                            transferCandidates.push({
                                startRoute: { ...startRoute, end: startStop.name, segment: `${startPoint.label} to ${startStop.name}` },
                                endRoute: { ...endRoute, start: endStop.name, segment: `${endStop.name} to ${endPoint.label}` },
                                transferPoint: startStop.name,
                                totalDistance: distance
                            });
                        }
                    });
                });
            });
        });

        return transferCandidates.length ? transferCandidates.sort((a, b) => a.totalDistance - b.totalDistance)[0] : null;
    };

    const findCbdRouteSegment = (startPoint, endPoint, allRoutes, toCbd) => {
        const candidates = cbdStops.map(cbdStop => {
            const routes = toCbd
                ? findRouteSegment(startPoint, { label: "CBD", lat: cbdStop.lat, lng: cbdStop.lng, h3Index: cbdStop.h3Index }, allRoutes)
                : findRouteSegment({ label: "CBD", lat: cbdStop.lat, lng: cbdStop.lng, h3Index: cbdStop.h3Index }, endPoint, allRoutes);
            return routes.length ? { route: routes[0], cbdStop } : null;
        }).filter(Boolean);

        if (!candidates.length) return null;
        return candidates.sort((a, b) => {
            const aDist = h3.greatCircleDistance(
                toCbd ? [startPoint.lat, startPoint.lng] : [endPoint.lat, endPoint.lng],
                [a.cbdStop.lat, a.cbdStop.lng], 'km'
            );
            const bDist = h3.greatCircleDistance(
                toCbd ? [startPoint.lat, startPoint.lng] : [endPoint.lat, endPoint.lng],
                [b.cbdStop.lat, b.cbdStop.lng], 'km'
            );
            return aDist - bDist;
        })[0];
    };

    const busRoutes = [];
    let lastEndPoint = null;

    // Use Eulerian Path for multi-segment journey planning
    for (let i = 0; i < refinedUserPoints.length - 1; i++) {
        const startPoint = refinedUserPoints[i];
        const endPoint = refinedUserPoints[i + 1];

        if (lastEndPoint && lastEndPoint.label !== startPoint.label) {
            alerts.push(`Continuity alert: Gap between ${lastEndPoint.label} and ${startPoint.label}`);
            break;
        }

        const directRoutes = findRouteSegment(startPoint, endPoint, allRoutes, true);
        if (directRoutes.length) {
            busRoutes.push(directRoutes[0]);
            lastEndPoint = endPoint;
            continue;
        }

        // Check Eulerian Path for transfer sequence
        let found = false;
        for (let j = 0; j < transferSequence.length; j++) {
            const transfer = transferSequence[j];
            const startRoute = allRoutes.find(r => r.route_number === transfer.fromRoute);
            const endRoute = allRoutes.find(r => r.route_number === transfer.toRoute);

            if (!startRoute || !endRoute) continue;

            const startMatch = findRouteSegment(startPoint, { label: transfer.transferPoint, lat: transfer.from.lat, lng: transfer.from.lng, h3Index: h3.latLngToCell(transfer.from.lat, transfer.from.lng, helixStructure.h3Resolution) }, allRoutes);
            const endMatch = findRouteSegment({ label: transfer.transferPoint, lat: transfer.to.lat, lng: transfer.to.lng, h3Index: h3.latLngToCell(transfer.to.lat, transfer.to.lng, helixStructure.h3Resolution) }, endPoint, allRoutes);

            if (startMatch.length && endMatch.length) {
                busRoutes.push(
                    { ...startMatch[0], note: `Transfer at ${transfer.transferPoint}` },
                    { ...endMatch[0], note: `Board after transfer from ${transfer.transferPoint}` }
                );
                lastEndPoint = endPoint;
                found = true;
                break;
            }
        }

        if (found) continue;

        const transfer = findTransferRoutes(startPoint, endPoint, allRoutes);
        if (transfer) {
            busRoutes.push(
                { ...transfer.startRoute, note: `Transfer at ${transfer.transferPoint}` },
                { ...transfer.endRoute, note: `Board after transfer from ${transfer.transferPoint}` }
            );
            lastEndPoint = endPoint;
            continue;
        }

        const toCbd = findCbdRouteSegment(startPoint, endPoint, allRoutes, true);
        const fromCbd = findCbdRouteSegment(startPoint, endPoint, allRoutes, false);
        if (toCbd && fromCbd) {
            const transferPoint = toCbd.cbdStop.name;
            busRoutes.push(
                { ...toCbd.route, segment: `${startPoint.label} to CBD (${transferPoint})`, note: `Transfer at ${transferPoint}` },
                { ...fromCbd.route, segment: `CBD (${transferPoint}) to ${endPoint.label}`, note: `Board after transfer from ${transferPoint}` }
            );
            lastEndPoint = endPoint;
            continue;
        }

        console.warn(`No simple route for ${startPoint.label} to ${endPoint.label}; trying multi-step`);
        for (const route of allRoutes) {
            const stops = [
                { name: route.pickup_point.name, ...refineCoordinates(route.pickup_point.pickup_latlng), h3Index: h3.latLngToCell(route.pickup_point.pickup_latlng.latitude, route.pickup_point.pickup_latlng.longitude, helixStructure.h3Resolution) },
                ...route.destinations.map(d => ({ name: d.name, ...refineCoordinates(d.destination_latlng), h3Index: h3.latLngToCell(d.destination_latlng.latitude, d.destination_latlng.longitude, helixStructure.h3Resolution) }))
            ];
            for (const stop of stops) {
                const toIntermediate = findRouteSegment(startPoint, { label: stop.name, lat: stop.lat, lng: stop.lat, h3Index: stop.h3Index }, allRoutes);
                const fromIntermediate = findRouteSegment({ label: stop.name, lat: stop.lat, lng: stop.lng, h3Index: stop.h3Index }, endPoint, allRoutes);
                if (toIntermediate.length && fromIntermediate.length) {
                    busRoutes.push(
                        { ...toIntermediate[0], segment: `${startPoint.label} to ${stop.name}`, note: `Transfer at ${stop.name}` },
                        { ...fromIntermediate[0], segment: `${stop.name} to ${endPoint.label}`, note: `Board after transfer from ${stop.name}` }
                    );
                    lastEndPoint = endPoint;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (!found) {
            alerts.push(`Continuity alert: No route found to connect ${startPoint.label} to ${endPoint.label}`);
            console.warn(`No route found for ${startPoint.label} to ${endPoint.label}`);
        }
    }

    console.log('Found bus routes:', busRoutes);
    return { routes: busRoutes, userPoints: refinedUserPoints, alerts, transferSequence };
}

// Generate the display results using the routes, userPoints, and alerts
function displayResults({ routes: busRoutes, userPoints, alerts, transferSequence }, helixStructure) {
    const resultDiv = document.getElementById('bus-routes');
    if (!resultDiv) {
        console.warn('No #bus-routes element found in DOM');
        return;
    }

    let html = `<h2>Bus Route Journey (RNP ${helixStructure.rnpValue})</h2>
                <p>H3 Center: ${helixStructure.h3Center}</p>
                <p>RNP Tolerance: ${(helixStructure.rnpValue * 1.852).toFixed(2)} km</p>`;

    html += `<p><strong>Waypoints:</strong> ${userPoints.map(p =>
        `${p.label}: ${formatLatLng(p.lat, p.lng)} (H3: ${p.h3Index})`
    ).join('; ')}</p>`;

    const wasRefined = userPoints.some(p => {
        const orig = helixStructure.points.find(hp => hp.label === p.label);
        if (!orig) {
            console.warn(`No original point found for ${p.label}`);
            return false;
        }
        return Math.abs(p.lat - orig.lat) > 0.000001 || Math.abs(p.lng - orig.lng) > 0.000001;
    });
    if (wasRefined) {
        html += `<p><em>Coordinates refined for higher precision</em></p>`;
    }

    if (alerts.length) {
        html += `<p><strong>Alerts:</strong> ${alerts.join('; ')}</p>`;
    }

    if (transferSequence.length) {
        html += `<p><strong>Optimized Transfer Sequence:</strong> ${transferSequence.map(t =>
            `Route ${t.fromRoute} to Route ${t.toRoute} at ${t.transferPoint} (${t.distanceKm.toFixed(2)} km)`
        ).join('; ')}</p>`;
    }

    if (!busRoutes.length) {
        html += '<p>No bus routes found.</p>';
    } else {
        const segments = {};
        busRoutes.forEach(route => {
            if (!segments[route.segment]) segments[route.segment] = [];
            segments[route.segment].push(route);
        });

        html += '<ol>';
        let stepNumber = 1;

        const orderedSegments = Object.keys(segments).sort((a, b) => {
            const aStartIdx = userPoints.findIndex(p => a.startsWith(p.label));
            const bStartIdx = userPoints.findIndex(p => b.startsWith(p.label));
            const aEndIdx = userPoints.findIndex(p => a.includes(`to ${p.label}`));
            const bEndIdx = userPoints.findIndex(p => b.includes(`to ${p.label}`));

            if (aStartIdx !== -1 && bStartIdx !== -1) {
                if (aStartIdx === bStartIdx) {
                    if (aEndIdx !== -1 && bEndIdx !== -1) return aEndIdx - bEndIdx;
                    if (aEndIdx !== -1) return -1;
                    if (bEndIdx !== -1) return 1;
                }
                return aStartIdx - bStartIdx;
            }
            if (aStartIdx !== -1) return -1;
            if (bStartIdx !== -1) return 1;
            return a.localeCompare(b);
        });

        orderedSegments.forEach(segment => {
            const routes = segments[segment];
            html += `<li><strong>${segment}</strong><ul>`;
            routes.forEach(route => {
                const stopsText = Array.isArray(route.stops) && route.stops.length
                    ? route.stops.map(s => {
                        const name = s.name.length > 30 ? `${s.name.substring(0, 27)}...` : s.name;
                        return `${name} (H3: ${s.h3Index})`;
                    }).join(', ')
                    : 'No stops available';
                const noteText = route.note ? ` (${route.note})` : '';
                const directionText = `Board at ${route.start} heading to ${route.end}`;

                html += `<li>Step ${stepNumber}: Take Route ${route.routeNumber} - ${directionText}${noteText}<br>
                         Stops: ${stopsText}</li>`;
                stepNumber++;
            });
            html += `</ul></li>`;
        });

        html += `</ol>`;
    }

    resultDiv.innerHTML = html;
}

// Main function to orchestrate route finding
async function findMa3(helixStructure, globalRoutesDAG) {
    if (!globalRoutesDAG) {
        console.error('globalRoutesDAG not loaded');
        return { routes: [], userPoints: [], alerts: ["System integrity failure: globalRoutesDAG not loaded"] };
    }

    const refinedRoutes = globalRoutesDAG.non_null_objects.map(route => ({
        ...route,
        pickup_point: {
            ...route.pickup_point,
            pickup_latlng: refineCoordinates(route.pickup_point.pickup_latlng)
        },
        destinations: route.destinations.map(d => ({
            ...d,
            destination_latlng: refineCoordinates(d.destination_latlng)
        }))
    }));

    const route3DIndex = indexRoutesWithRBush3D(refinedRoutes);
    const routeClusters = hierarchicalGreedyClustering(
        route3DIndex,
        helixStructure.h3Resolution,
        helixStructure.maxDistanceKm || 1.0,
        helixStructure.ringSize || 1,
        10
    );

    return findOverlappingRoutes(helixStructure, { non_null_objects: refinedRoutes }, routeClusters, route3DIndex);
}

export { findMa3, hierarchicalGreedyClustering, indexRoutesWithRBush3D, displayResults };
