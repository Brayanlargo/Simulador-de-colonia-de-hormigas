import React, { useEffect, useRef, useState } from "react";
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
const MAP_HEIGHT = SCREEN_HEIGHT - 190;

const ANT_COUNT = 18;
const FOOD_COUNT = 5;

const ANTHILL = {
  x: MAP_WIDTH / 2,
  y: MAP_HEIGHT / 2,
};

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(a, b) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
  );
}

function createAnt(id) {
  const angle = Math.random() * Math.PI * 2;

  return {
    id,
    x: ANTHILL.x + Math.cos(angle) * 15,
    y: ANTHILL.y + Math.sin(angle) * 15,

    angle: Math.random() * Math.PI * 2,

    state: "searching",
    targetFood: null,

    carriedFood: 0,

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

export default function App() {
  const [ants, setAnts] = useState([]);
  const [foods, setFoods] = useState([]);
  const [pheromones, setPheromones] = useState([]);
  const [storedFood, setStoredFood] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  const animationRef = useRef(null);

  const initializeSimulation = () => {
    const newAnts = [];

    for (let i = 0; i < ANT_COUNT; i++) {
      newAnts.push(createAnt(i));
    }

    const newFoods = [];

    for (let i = 0; i < FOOD_COUNT; i++) {
      newFoods.push(createFood(i));
    }

    setAnts(newAnts);
    setFoods(newFoods);
    setPheromones([]);
    setStoredFood(0);
  };

  useEffect(() => {
    initializeSimulation();
  }, []);

  useEffect(() => {
    if (!isRunning) {
      cancelAnimationFrame(animationRef.current);
      return;
    }

    const updateSimulation = () => {
      setAnts((currentAnts) => {
        const updatedAnts = currentAnts.map((ant) => {
          let newAnt = { ...ant };

          // ==========================================
          // ESTADO: BUSCANDO COMIDA
          // ==========================================

          if (newAnt.state === "searching") {
            // Movimiento aleatorio
            newAnt.angle += random(-0.15, 0.15);

            newAnt.x += Math.cos(newAnt.angle) * newAnt.speed;
            newAnt.y += Math.sin(newAnt.angle) * newAnt.speed;

            // Mantener dentro del mapa
            if (newAnt.x < 10 || newAnt.x > MAP_WIDTH - 10) {
              newAnt.angle = Math.PI - newAnt.angle;
            }

            if (newAnt.y < 10 || newAnt.y > MAP_HEIGHT - 10) {
              newAnt.angle = -newAnt.angle;
            }

            // Buscar comida cercana
            let closestFood = null;
            let closestDistance = Infinity;

            foods.forEach((food) => {
              if (food.amount <= 0) return;

              const d = distance(newAnt, food);

              if (d < closestDistance) {
                closestDistance = d;
                closestFood = food;
              }
            });

            // Si encuentra comida
            if (closestFood && closestDistance < 18) {
              newAnt.state = "returning";
              newAnt.targetFood = closestFood.id;
              newAnt.carriedFood = 1;

              // Crear feromona
              setPheromones((current) => [
                ...current.slice(-150),
                {
                  id: Math.random(),
                  x: newAnt.x,
                  y: newAnt.y,
                  opacity: 1,
                },
              ]);

              setFoods((currentFoods) =>
                currentFoods.map((food) =>
                  food.id === closestFood.id
                    ? {
                        ...food,
                        amount: Math.max(0, food.amount - 1),
                      }
                    : food
                )
              );
            }
          }

          // ==========================================
          // ESTADO: REGRESANDO AL HORMIGUERO
          // ==========================================

          if (newAnt.state === "returning") {
            const dx = ANTHILL.x - newAnt.x;
            const dy = ANTHILL.y - newAnt.y;

            const angle = Math.atan2(dy, dx);

            newAnt.angle = angle;

            newAnt.x += Math.cos(angle) * newAnt.speed * 1.4;
            newAnt.y += Math.sin(angle) * newAnt.speed * 1.4;

            // Dejar feromonas
            if (Math.random() < 0.08) {
              setPheromones((current) => [
                ...current.slice(-150),
                {
                  id: Math.random(),
                  x: newAnt.x,
                  y: newAnt.y,
                  opacity: 1,
                },
              ]);
            }

            // Llegó al hormiguero
            if (distance(newAnt, ANTHILL) < 20) {
              setStoredFood((food) => food + newAnt.carriedFood);

              newAnt.carriedFood = 0;
              newAnt.state = "searching";
              newAnt.targetFood = null;

              newAnt.angle = Math.random() * Math.PI * 2;
            }
          }

          return newAnt;
        });

        return updatedAnts;
      });

      // ==========================================
      // DESVANECER FEROMONAS
      // ==========================================

      setPheromones((current) =>
        current
          .map((pheromone) => ({
            ...pheromone,
            opacity: pheromone.opacity - 0.01,
          }))
          .filter((pheromone) => pheromone.opacity > 0)
      );

      animationRef.current = requestAnimationFrame(updateSimulation);
    };

    animationRef.current = requestAnimationFrame(updateSimulation);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isRunning, foods]);

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>🐜 Colonia</Text>
          <Text style={styles.subtitle}>Simulador de hormigas</Text>
        </View>

        <View style={styles.stats}>
          <Text style={styles.stat}>🐜 {ants.length}</Text>
          <Text style={styles.stat}>🍎 {storedFood}</Text>
        </View>
      </View>

      {/* MAPA */}

      <View style={styles.map}>
        {/* FEROMONAS */}

        {pheromones.map((pheromone) => (
          <View
            key={pheromone.id}
            style={[
              styles.pheromone,
              {
                left: pheromone.x,
                top: pheromone.y,
                opacity: pheromone.opacity,
              },
            ]}
          />
        ))}

        {/* COMIDA */}

        {foods.map((food) => {
          if (food.amount <= 0) return null;

          return (
            <View
              key={food.id}
              style={[
                styles.food,
                {
                  left: food.x - 10,
                  top: food.y - 10,
                },
              ]}
            >
              <Text style={styles.foodText}>🍎</Text>

              <Text style={styles.foodAmount}>
                {food.amount}
              </Text>
            </View>
          );
        })}

        {/* HORMIGUERO */}

        <View
          style={[
            styles.anthill,
            {
              left: ANTHILL.x - 30,
              top: ANTHILL.y - 30,
            },
          ]}
        >
          <Text style={styles.anthillText}>🕳️</Text>

          <Text style={styles.queen}>👑</Text>
        </View>

        {/* HORMIGAS */}

        {ants.map((ant) => (
          <View
            key={ant.id}
            style={[
              styles.ant,
              {
                left: ant.x - 8,
                top: ant.y - 8,
                transform: [
                  {
                    rotate: `${ant.angle}rad`,
                  },
                ],
              },
            ]}
          >
            <Text style={styles.antText}>
              🐜
            </Text>

            {ant.carriedFood > 0 && (
              <Text style={styles.carriedFood}>
                🍎
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* CONTROLES */}

      <View style={styles.controls}>
        <Pressable
          style={styles.button}
          onPress={() => setIsRunning(!isRunning)}
        >
          <Text style={styles.buttonText}>
            {isRunning ? "⏸️ Pausar" : "▶️ Continuar"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.resetButton]}
          onPress={initializeSimulation}
        >
          <Text style={styles.buttonText}>
            🔄 Reiniciar
          </Text>
        </Pressable>
      </View>

      {/* INFORMACIÓN */}

      <View style={styles.info}>
        <Text style={styles.infoText}>
          🔴 Feromonas: {pheromones.length}
        </Text>

        <Text style={styles.infoText}>
          🍎 Recursos disponibles:{" "}
          {foods.reduce((sum, food) => sum + food.amount, 0)}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },

  // ===============================
  // HEADER
  // ===============================

  header: {
    height: 85,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: {
    color: "#F9FAFB",
    fontSize: 25,
    fontWeight: "800",
  },

  subtitle: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 2,
  },

  stats: {
    flexDirection: "row",
    gap: 12,
  },

  stat: {
    backgroundColor: "#1F2937",
    color: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    fontWeight: "700",
  },

  // ===============================
  // MAPA
  // ===============================

  map: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    marginHorizontal: 12,

    backgroundColor: "#26351F",

    borderRadius: 18,

    overflow: "hidden",

    borderWidth: 2,
    borderColor: "#374A2C",
  },

  // ===============================
  // HORMIGUERO
  // ===============================

  anthill: {
    position: "absolute",

    width: 60,
    height: 60,

    borderRadius: 30,

    backgroundColor: "#4B2E1E",

    justifyContent: "center",
    alignItems: "center",

    borderWidth: 3,
    borderColor: "#6B4226",
  },

  anthillText: {
    fontSize: 35,
  },

  queen: {
    position: "absolute",
    fontSize: 15,
    right: -5,
    top: -3,
  },

  // ===============================
  // HORMIGAS
  // ===============================

  ant: {
    position: "absolute",

    width: 16,
    height: 16,

    justifyContent: "center",
    alignItems: "center",
  },

  antText: {
    fontSize: 15,
  },

  carriedFood: {
    position: "absolute",

    fontSize: 7,

    top: -5,
    right: -6,
  },

  // ===============================
  // COMIDA
  // ===============================

  food: {
    position: "absolute",

    width: 25,
    height: 25,

    justifyContent: "center",
    alignItems: "center",
  },

  foodText: {
    fontSize: 20,
  },

  foodAmount: {
    position: "absolute",

    top: 18,

    fontSize: 9,

    color: "#FFFFFF",

    backgroundColor: "#DC2626",

    paddingHorizontal: 3,
    borderRadius: 4,

    fontWeight: "bold",
  },

  // ===============================
  // FEROMONAS
  // ===============================

  pheromone: {
    position: "absolute",

    width: 5,
    height: 5,

    borderRadius: 3,

    backgroundColor: "#F59E0B",
  },

  // ===============================
  // CONTROLES
  // ===============================

  controls: {
    height: 70,

    flexDirection: "row",

    justifyContent: "center",
    alignItems: "center",

    gap: 12,
  },

  button: {
    backgroundColor: "#16A34A",

    paddingHorizontal: 22,
    paddingVertical: 12,

    borderRadius: 12,
  },

  resetButton: {
    backgroundColor: "#374151",
  },

  buttonText: {
    color: "#FFFFFF",

    fontSize: 15,

    fontWeight: "700",
  },

  // ===============================
  // INFO
  // ===============================

  info: {
    paddingHorizontal: 18,
    paddingBottom: 10,

    flexDirection: "row",
    justifyContent: "space-between",
  },

  infoText: {
    color: "#9CA3AF",
    fontSize: 11,
  },
});
