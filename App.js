import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  SafeAreaView,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MAP_WIDTH = SCREEN_WIDTH - 24;
const MAP_HEIGHT = SCREEN_HEIGHT - 260;

const ANT_COUNT = 18;
const RIVAL_ANT_COUNT = 12;
const FOOD_COUNT = 5;
const MAX_FOOD_SOURCES = 10;
const FOOD_RESPAWN_THRESHOLD = 40;

const MAX_ENERGY = 100;
const ENERGY_DRAIN = 0.06;
const ENERGY_RESTORE = 45;

const PHEROMONE_SMELL_RADIUS = 42;
const PHEROMONE_SMELL_RADIUS_SQ = PHEROMONE_SMELL_RADIUS * PHEROMONE_SMELL_RADIUS;
const FOOD_SIGHT_RADIUS = 55;
const FOOD_SIGHT_RADIUS_SQ = FOOD_SIGHT_RADIUS * FOOD_SIGHT_RADIUS;
const PICKUP_RADIUS_SQ = 18 * 18;
const ARRIVAL_RADIUS_SQ = 20 * 20;
const OBSTACLE_BUFFER = 14;

const PHEROMONE_CAP = 100;
const PHEROMONE_DECAY = 0.015;
const PHEROMONE_DROP_CHANCE = 0.05;

const ANTHILL = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

let nextAntId = ANT_COUNT;
let nextRivalId = RIVAL_ANT_COUNT;
let nextFoodId = FOOD_COUNT;
let nextObstacleId = 0;

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distance(a, b) {
  return Math.sqrt(distanceSq(a, b));
}

function createAntAt(id, anthill) {
  const angle = Math.random() * Math.PI * 2;
  return {
    id,
    x: anthill.x + Math.cos(angle) * 15,
    y: anthill.y + Math.sin(angle) * 15,
    angle: Math.random() * Math.PI * 2,
    state: "searching",
    carriedFood: 0,
    energy: MAX_ENERGY,
    speed: random(0.7, 1.4),
  };
}

function createFood(id) {
  return {
    id,
    x: random(30, MAP_WIDTH - 30),
    y: random(30, MAP_HEIGHT - 30),
    amount: Math.floor(random(20, 50)),
  };
}

// ==========================================
// LÓGICA PURA DE MOVIMIENTO (sin sqrt en loops calientes)
// ==========================================

function avoidanceVector(ant, obstacles) {
  let pushX = 0;
  let pushY = 0;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const d = distance(ant, o);
    const limit = o.radius + OBSTACLE_BUFFER;

    if (d < limit) {
      const angleAway = Math.atan2(ant.y - o.y, ant.x - o.x);
      const strength = (limit - d) / limit;
      pushX += Math.cos(angleAway) * strength;
      pushY += Math.sin(angleAway) * strength;
    }
  }

  return { pushX, pushY };
}

function moveAnt(ant, ctx) {
  const { foods, pheromones, obstacles, anthill, speedMultiplier } = ctx;

  let newAnt = { ...ant };
  newAnt.energy -= ENERGY_DRAIN;

  if (newAnt.energy <= 0) {
    return { died: true };
  }

  let pheromoneToAdd = null;
  let foodIdConsumed = null;
  let deposited = 0;

  if (newAnt.state === "searching") {
    let nearestFood = null;
    let nearestFoodDistSq = FOOD_SIGHT_RADIUS_SQ;

    for (let i = 0; i < foods.length; i++) {
      const food = foods[i];
      if (food.amount <= 0) continue;
      const dSq = distanceSq(newAnt, food);
      if (dSq < nearestFoodDistSq) {
        nearestFoodDistSq = dSq;
        nearestFood = food;
      }
    }

    if (nearestFood) {
      const targetAngle = Math.atan2(nearestFood.y - newAnt.y, nearestFood.x - newAnt.x);
      let diff = targetAngle - newAnt.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      newAnt.angle += diff * 0.4;
    } else {
      let nearestPher = null;
      let nearestPherDistSq = PHEROMONE_SMELL_RADIUS_SQ;

      for (let i = 0; i < pheromones.length; i++) {
        const p = pheromones[i];
        const dSq = distanceSq(newAnt, p);
        if (dSq < nearestPherDistSq) {
          nearestPherDistSq = dSq;
          nearestPher = p;
        }
      }

      if (nearestPher) {
        const targetAngle = Math.atan2(nearestPher.y - newAnt.y, nearestPher.x - newAnt.x);
        let diff = targetAngle - newAnt.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        newAnt.angle += diff * 0.15 + random(-0.05, 0.05);
      } else {
        newAnt.angle += random(-0.15, 0.15);
      }
    }

    const { pushX, pushY } = avoidanceVector(newAnt, obstacles);
    if (pushX !== 0 || pushY !== 0) {
      const vx = Math.cos(newAnt.angle) + pushX * 2.5;
      const vy = Math.sin(newAnt.angle) + pushY * 2.5;
      newAnt.angle = Math.atan2(vy, vx);
    }

    newAnt.x += Math.cos(newAnt.angle) * newAnt.speed * speedMultiplier;
    newAnt.y += Math.sin(newAnt.angle) * newAnt.speed * speedMultiplier;

    if (newAnt.x < 10 || newAnt.x > MAP_WIDTH - 10) newAnt.angle = Math.PI - newAnt.angle;
    if (newAnt.y < 10 || newAnt.y > MAP_HEIGHT - 10) newAnt.angle = -newAnt.angle;

    newAnt.x = Math.max(5, Math.min(MAP_WIDTH - 5, newAnt.x));
    newAnt.y = Math.max(5, Math.min(MAP_HEIGHT - 5, newAnt.y));

    if (nearestFood && nearestFoodDistSq < PICKUP_RADIUS_SQ) {
      newAnt.state = "returning";
      newAnt.carriedFood = 1;
      foodIdConsumed = nearestFood.id;
      pheromoneToAdd = { id: Math.random(), x: newAnt.x, y: newAnt.y, opacity: 1 };
    }
  }

  if (newAnt.state === "returning") {
    const dx = anthill.x - newAnt.x;
    const dy = anthill.y - newAnt.y;
    let angle = Math.atan2(dy, dx);

    const { pushX, pushY } = avoidanceVector(newAnt, obstacles);
    if (pushX !== 0 || pushY !== 0) {
      const vx = Math.cos(angle) + pushX * 2.5;
      const vy = Math.sin(angle) + pushY * 2.5;
      angle = Math.atan2(vy, vx);
    }

    newAnt.angle = angle;
    newAnt.x += Math.cos(angle) * newAnt.speed * 1.4 * speedMultiplier;
    newAnt.y += Math.sin(angle) * newAnt.speed * 1.4 * speedMultiplier;

    if (Math.random() < PHEROMONE_DROP_CHANCE) {
      pheromoneToAdd = { id: Math.random(), x: newAnt.x, y: newAnt.y, opacity: 1 };
    }

    if (distanceSq(newAnt, anthill) < ARRIVAL_RADIUS_SQ) {
      deposited = newAnt.carriedFood;
      newAnt.carriedFood = 0;
      newAnt.state = "searching";
      newAnt.energy = Math.min(MAX_ENERGY, newAnt.energy + ENERGY_RESTORE);
      newAnt.angle = Math.random() * Math.PI * 2;
    }
  }

  return { ant: newAnt, pheromoneToAdd, foodIdConsumed, deposited };
}

// ==========================================
// COMPONENTES MEMOIZADOS
// ==========================================

const AntDot = React.memo(function AntDot({ x, y, angle, opacity, carrying, rival }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.ant, { left: x - 8, top: y - 8, opacity, transform: [{ rotate: `${angle}rad` }] }]}
    >
      {rival && <View style={styles.rivalHalo} />}
      <Text style={styles.antText}>🐜</Text>
      {carrying > 0 && <Text style={styles.carriedFood}>🍎</Text>}
    </View>
  );
});

const FoodDot = React.memo(function FoodDot({ x, y, amount }) {
  return (
    <View pointerEvents="none" style={[styles.food, { left: x - 10, top: y - 10 }]}>
      <Text style={styles.foodText}>🍎</Text>
      <Text style={styles.foodAmount}>{amount}</Text>
    </View>
  );
});

const PheromoneDot = React.memo(function PheromoneDot({ x, y, opacity, rival }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.pheromone, rival && styles.rivalPheromone, { left: x, top: y, opacity }]}
    />
  );
});

const ObstacleDot = React.memo(function ObstacleDot({ x, y, radius }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.obstacle,
        { left: x - radius, top: y - radius, width: radius * 2, height: radius * 2, borderRadius: radius },
      ]}
    >
      <Text style={{ fontSize: radius }}>🪨</Text>
    </View>
  );
});

// puntitos de tierra fijos, decorativos (no afectan la simulación)
const SOIL_SPECKS = Array.from({ length: 45 }, () => ({
  x: random(0, MAP_WIDTH),
  y: random(0, MAP_HEIGHT),
  o: random(0.04, 0.12),
}));

export default function App() {
  const [ants, setAnts] = useState([]);
  const [rivalAnts, setRivalAnts] = useState([]);
  const [foods, setFoods] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [pheromones, setPheromones] = useState([]);
  const [rivalPheromones, setRivalPheromones] = useState([]);
  const [storedFood, setStoredFood] = useState(0);
  const [rivalStoredFood, setRivalStoredFood] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [mode, setMode] = useState("food");
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [hasRival, setHasRival] = useState(false);

  const animationRef = useRef(null);
  const mapRef = useRef(null);
  const mapOffset = useRef({ x: 0, y: 0 });

  const antsRef = useRef([]);
  const rivalAntsRef = useRef([]);
  const foodsRef = useRef([]);
  const obstaclesRef = useRef([]);
  const pheromonesRef = useRef([]);
  const rivalPheromonesRef = useRef([]);
  const rivalAnthillRef = useRef(null);
  const speedRef = useRef(1);

  useEffect(() => { antsRef.current = ants; }, [ants]);
  useEffect(() => { rivalAntsRef.current = rivalAnts; }, [rivalAnts]);
  useEffect(() => { foodsRef.current = foods; }, [foods]);
  useEffect(() => { obstaclesRef.current = obstacles; }, [obstacles]);
  useEffect(() => { pheromonesRef.current = pheromones; }, [pheromones]);
  useEffect(() => { rivalPheromonesRef.current = rivalPheromones; }, [rivalPheromones]);
  useEffect(() => { speedRef.current = speedMultiplier; }, [speedMultiplier]);

  const measureMap = () => {
    if (mapRef.current) {
      mapRef.current.measureInWindow((x, y) => {
        mapOffset.current = { x, y };
      });
    }
  };

  const initializeSimulation = () => {
    nextAntId = ANT_COUNT;
    nextRivalId = RIVAL_ANT_COUNT;
    nextFoodId = FOOD_COUNT;
    nextObstacleId = 0;

    setAnts(Array.from({ length: ANT_COUNT }, (_, i) => createAntAt(i, ANTHILL)));
    setFoods(Array.from({ length: FOOD_COUNT }, (_, i) => createFood(i)));
    setObstacles([]);
    setPheromones([]);
    setRivalPheromones([]);
    setStoredFood(0);
    setDeaths(0);
    setRivalAnts([]);
    setRivalStoredFood(0);
    setHasRival(false);
    rivalAnthillRef.current = null;
  };

  useEffect(() => {
    initializeSimulation();
  }, []);

  useEffect(() => {
    if (!isRunning) {
      cancelAnimationFrame(animationRef.current);
      return;
    }

    const tick = () => {
      const currentFoods = foodsRef.current;
      const currentObstacles = obstaclesRef.current;
      const speedMult = speedRef.current;

      const foodConsumption = {};
      let depositedMain = 0;
      let depositedRival = 0;

      const newAnts = [];
      const newPheromones = [];

      for (let i = 0; i < antsRef.current.length; i++) {
        const result = moveAnt(antsRef.current[i], {
          foods: currentFoods,
          pheromones: pheromonesRef.current,
          obstacles: currentObstacles,
          anthill: ANTHILL,
          speedMultiplier: speedMult,
        });

        if (result.died) {
          setDeaths((d) => d + 1);
          continue;
        }

        if (result.pheromoneToAdd) newPheromones.push(result.pheromoneToAdd);
        if (result.foodIdConsumed) {
          foodConsumption[result.foodIdConsumed] = (foodConsumption[result.foodIdConsumed] || 0) + 1;
        }
        depositedMain += result.deposited;
        newAnts.push(result.ant);
      }

      while (newAnts.length < ANT_COUNT) newAnts.push(createAntAt(nextAntId++, ANTHILL));

      const newRivalAnts = [];
      const newRivalPheromones = [];

      if (rivalAnthillRef.current) {
        for (let i = 0; i < rivalAntsRef.current.length; i++) {
          const result = moveAnt(rivalAntsRef.current[i], {
            foods: currentFoods,
            pheromones: rivalPheromonesRef.current,
            obstacles: currentObstacles,
            anthill: rivalAnthillRef.current,
            speedMultiplier: speedMult,
          });

          if (result.died) continue;

          if (result.pheromoneToAdd) newRivalPheromones.push(result.pheromoneToAdd);
          if (result.foodIdConsumed) {
            foodConsumption[result.foodIdConsumed] = (foodConsumption[result.foodIdConsumed] || 0) + 1;
          }
          depositedRival += result.deposited;
          newRivalAnts.push(result.ant);
        }

        while (newRivalAnts.length < RIVAL_ANT_COUNT) {
          newRivalAnts.push(createAntAt(nextRivalId++, rivalAnthillRef.current));
        }
      }

      let updatedFoods = currentFoods.map((f) =>
        foodConsumption[f.id] ? { ...f, amount: Math.max(0, f.amount - foodConsumption[f.id]) } : f
      );

      const total = updatedFoods.reduce((sum, f) => sum + f.amount, 0);
      const alive = updatedFoods.filter((f) => f.amount > 0);

      if (total < FOOD_RESPAWN_THRESHOLD && alive.length < MAX_FOOD_SOURCES) {
        updatedFoods = [...alive, createFood(nextFoodId++)];
      } else {
        updatedFoods = alive;
      }

      const fadedPher = [...pheromonesRef.current, ...newPheromones]
        .slice(-PHEROMONE_CAP)
        .map((p) => ({ ...p, opacity: p.opacity - PHEROMONE_DECAY }))
        .filter((p) => p.opacity > 0);

      const fadedRivalPher = [...rivalPheromonesRef.current, ...newRivalPheromones]
        .slice(-PHEROMONE_CAP)
        .map((p) => ({ ...p, opacity: p.opacity - PHEROMONE_DECAY }))
        .filter((p) => p.opacity > 0);

      setAnts(newAnts);
      setFoods(updatedFoods);
      setPheromones(fadedPher);
      if (rivalAnthillRef.current) {
        setRivalAnts(newRivalAnts);
        setRivalPheromones(fadedRivalPher);
      }
      if (depositedMain > 0) setStoredFood((s) => s + depositedMain);
      if (depositedRival > 0) setRivalStoredFood((s) => s + depositedRival);

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isRunning]);

  const handleMapPress = useCallback((e) => {
    const { pageX, pageY } = e.nativeEvent;
    const locationX = pageX - mapOffset.current.x;
    const locationY = pageY - mapOffset.current.y;

    if (mode === "food") {
      setFoods((current) => [...current, { ...createFood(nextFoodId++), x: locationX, y: locationY }]);
    }

    if (mode === "obstacle") {
      setObstacles((current) => [...current, { id: nextObstacleId++, x: locationX, y: locationY, radius: 22 }]);
    }

    if (mode === "erase") {
      const point = { x: locationX, y: locationY };
      setPheromones((current) => current.filter((p) => distance(p, point) > 25));
      setRivalPheromones((current) => current.filter((p) => distance(p, point) > 25));
    }

    if (mode === "rival" && !hasRival) {
      const anthill = { x: locationX, y: locationY };
      rivalAnthillRef.current = anthill;
      setRivalAnts(Array.from({ length: RIVAL_ANT_COUNT }, (_, i) => createAntAt(i, anthill)));
      setHasRival(true);
    }
  }, [mode, hasRival]);

  const removeRival = () => {
    rivalAnthillRef.current = null;
    setHasRival(false);
    setRivalAnts([]);
    setRivalPheromones([]);
    setRivalStoredFood(0);
  };

  const clearObstacles = () => setObstacles([]);

  const cycleSpeed = () => {
    setSpeedMultiplier((s) => (s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 0.5 : 1));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🐜</Text>
          </View>
          <View>
            <Text style={styles.title}>Colonia</Text>
            <Text style={styles.subtitle}>Simulador interactivo</Text>
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{ants.length}</Text>
            <Text style={styles.statLabel}>vivas</Text>
          </View>
          <View style={[styles.statPill, styles.statPillAmber]}>
            <Text style={styles.statValue}>{storedFood}</Text>
            <Text style={styles.statLabel}>comida</Text>
          </View>
          <View style={[styles.statPill, styles.statPillMuted]}>
            <Text style={styles.statValue}>{deaths}</Text>
            <Text style={styles.statLabel}>bajas</Text>
          </View>
          {hasRival && (
            <View style={[styles.statPill, styles.statPillRival]}>
              <Text style={styles.statValue}>{rivalStoredFood}</Text>
              <Text style={styles.statLabel}>rival</Text>
            </View>
          )}
        </View>
      </View>

      {/* MODOS */}
      <View style={styles.modeRow}>
        {[
          { key: "food", label: "Comida", icon: "🍎", color: "#7BA05B" },
          { key: "obstacle", label: "Obstáculo", icon: "🪨", color: "#8B5E3C" },
          { key: "erase", label: "Borrar rastro", icon: "🧽", color: "#6B7280" },
          { key: "rival", label: "Colonia rival", icon: "🐜", color: "#B0413E" },
        ].map((m) => {
          const active = mode === m.key;
          return (
            <Pressable
              key={m.key}
              style={[
                styles.modeChip,
                { borderColor: m.color },
                active && { backgroundColor: m.color },
              ]}
              onPress={() => setMode(m.key)}
            >
              <Text style={styles.modeIcon}>{m.icon}</Text>
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* MAPA */}
      <View style={styles.mapWrapper}>
        <Pressable ref={mapRef} style={styles.map} onPress={handleMapPress} onLayout={measureMap}>
          <View pointerEvents="none" style={styles.textureLayer}>
            {SOIL_SPECKS.map((s, i) => (
              <View key={i} style={[styles.speck, { left: s.x, top: s.y, opacity: s.o }]} />
            ))}
          </View>

          {pheromones.map((p) => (
            <PheromoneDot key={p.id} x={p.x} y={p.y} opacity={p.opacity} />
          ))}

          {rivalPheromones.map((p) => (
            <PheromoneDot key={`r-${p.id}`} x={p.x} y={p.y} opacity={p.opacity} rival />
          ))}

          {obstacles.map((o) => (
            <ObstacleDot key={o.id} x={o.x} y={o.y} radius={o.radius} />
          ))}

          {foods.map((food) =>
            food.amount > 0 ? <FoodDot key={food.id} x={food.x} y={food.y} amount={food.amount} /> : null
          )}

          <View pointerEvents="none" style={[styles.anthill, { left: ANTHILL.x - 32, top: ANTHILL.y - 32 }]}>
            <View style={styles.anthillRing} />
            <Text style={styles.anthillText}>🕳️</Text>
            <Text style={styles.queen}>👑</Text>
          </View>

          {hasRival && rivalAnthillRef.current && (
            <View
              pointerEvents="none"
              style={[
                styles.anthill,
                styles.rivalAnthill,
                { left: rivalAnthillRef.current.x - 32, top: rivalAnthillRef.current.y - 32 },
              ]}
            >
              <View style={[styles.anthillRing, styles.rivalRing]} />
              <Text style={styles.anthillText}>🕳️</Text>
              <Text style={styles.queen}>🏴</Text>
            </View>
          )}

          {ants.map((ant) => (
            <AntDot
              key={ant.id}
              x={ant.x}
              y={ant.y}
              angle={ant.angle}
              opacity={Math.max(0.35, ant.energy / MAX_ENERGY)}
              carrying={ant.carriedFood}
            />
          ))}

          {rivalAnts.map((ant) => (
            <AntDot
              key={`rival-${ant.id}`}
              x={ant.x}
              y={ant.y}
              angle={ant.angle}
              opacity={Math.max(0.35, ant.energy / MAX_ENERGY)}
              carrying={ant.carriedFood}
              rival
            />
          ))}

          <View pointerEvents="none" style={styles.vignette} />
        </Pressable>

        {/* DOCK FLOTANTE */}
        <View style={styles.dock}>
          <Pressable style={styles.dockButton} onPress={() => setIsRunning(!isRunning)}>
            <Text style={styles.dockIcon}>{isRunning ? "⏸️" : "▶️"}</Text>
            <Text style={styles.dockLabel}>{isRunning ? "Pausar" : "Seguir"}</Text>
          </Pressable>

          <Pressable style={styles.dockButton} onPress={cycleSpeed}>
            <Text style={styles.dockIcon}>⚡</Text>
            <Text style={styles.dockLabel}>x{speedMultiplier}</Text>
          </Pressable>

          <Pressable style={styles.dockButton} onPress={clearObstacles}>
            <Text style={styles.dockIcon}>🧹</Text>
            <Text style={styles.dockLabel}>Piedras</Text>
          </Pressable>

          {hasRival && (
            <Pressable style={[styles.dockButton, styles.dockButtonDanger]} onPress={removeRival}>
              <Text style={styles.dockIcon}>❌</Text>
              <Text style={styles.dockLabel}>Rival</Text>
            </Pressable>
          )}

          <Pressable style={[styles.dockButton, styles.dockButtonReset]} onPress={initializeSimulation}>
            <Text style={styles.dockIcon}>🔄</Text>
            <Text style={styles.dockLabel}>Reiniciar</Text>
          </Pressable>
        </View>
      </View>

      {/* INFO */}
      <View style={styles.info}>
        <Text style={styles.infoText}>Feromonas activas: {pheromones.length + rivalPheromones.length}</Text>
        <Text style={styles.infoText}>
          Recursos en el mapa: {foods.reduce((sum, food) => sum + food.amount, 0)}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14180F" },

  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#2E3B22",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3F5029",
  },
  badgeText: { fontSize: 20 },
  title: { color: "#EFEAE0", fontSize: 20, fontWeight: "700", letterSpacing: 0.2 },
  subtitle: { color: "#8A9578", fontSize: 12, marginTop: 1 },

  stats: { flexDirection: "row", flexWrap: "wrap", gap: 6, maxWidth: 170, justifyContent: "flex-end" },
  statPill: {
    backgroundColor: "#1F2617",
    borderWidth: 1,
    borderColor: "#333F24",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: "center",
    minWidth: 46,
  },
  statPillAmber: { borderColor: "#7A5222" },
  statPillMuted: { borderColor: "#3A3A3A" },
  statPillRival: { borderColor: "#6B2321" },
  statValue: { color: "#EFEAE0", fontSize: 13, fontWeight: "700" },
  statLabel: { color: "#8A9578", fontSize: 8, marginTop: 1 },

  modeRow: { flexDirection: "row", paddingHorizontal: 14, gap: 7, marginBottom: 10, flexWrap: "wrap" },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  modeIcon: { fontSize: 13 },
  modeChipText: { color: "#C9CFC0", fontSize: 11, fontWeight: "600" },
  modeChipTextActive: { color: "#14180F", fontWeight: "800" },

  mapWrapper: { flex: 1, marginHorizontal: 12, position: "relative" },
  map: {
    width: "100%",
    height: "100%",
    backgroundColor: "#26311C",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#3A4A28",
  },
  textureLayer: { ...StyleSheet.absoluteFillObject },
  speck: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#0D130A",
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 26,
    borderColor: "#14180F22",
  },

  anthill: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#3D2A1B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#5C3E24",
  },
  anthillRing: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: "#C98A3E33",
  },
  rivalRing: { borderColor: "#B0413E33" },
  rivalAnthill: { borderColor: "#8B2E2C" },
  anthillText: { fontSize: 34 },
  queen: { position: "absolute", fontSize: 15, right: -4, top: -2 },

  ant: {
    position: "absolute",
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
  },
  antText: { fontSize: 15 },
  carriedFood: { position: "absolute", fontSize: 7, top: -5, right: -6 },
  rivalHalo: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#B0413E55",
    top: -2,
    left: -2,
  },

  food: {
    position: "absolute",
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#C98A3E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  foodText: { fontSize: 20 },
  foodAmount: {
    position: "absolute",
    top: 19,
    fontSize: 9,
    color: "#14180F",
    backgroundColor: "#E0B563",
    paddingHorizontal: 4,
    borderRadius: 5,
    fontWeight: "800",
    overflow: "hidden",
  },

  pheromone: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C98A3E",
    shadowColor: "#C98A3E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  rivalPheromone: { backgroundColor: "#B0413E", shadowColor: "#B0413E" },

  obstacle: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0000001A",
    borderWidth: 1,
    borderColor: "#00000030",
  },

  dock: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#1B2116EE",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#3A4A28",
  },
  dockButton: {
    minWidth: 46,
    paddingHorizontal: 6,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#2E3B22",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  dockButtonReset: { backgroundColor: "#3A3020" },
  dockButtonDanger: { backgroundColor: "#4A2220" },
  dockIcon: { fontSize: 14 },
  dockLabel: { fontSize: 8, color: "#D7DCC9", fontWeight: "700" },

  info: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoText: { color: "#6E7A5E", fontSize: 11 },
});