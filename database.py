import os
import json
import psycopg
from dotenv import load_dotenv

load_dotenv()


def obtener_conexion():
    return psycopg.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )


def obtener_capa(tabla):
    conn = obtener_conexion()
    cur = conn.cursor()

    cur.execute(f"SELECT *, ST_AsGeoJSON(geom) FROM {tabla} WHERE geom IS NOT NULL;")

    filas = cur.fetchall()
    columnas = [desc.name for desc in cur.description][:-1]

    features = []

    for fila in filas:
        propiedades = dict(zip(columnas, fila[:-1]))
        propiedades.pop("geom", None)

        features.append({
            "type": "Feature",
            "geometry": json.loads(fila[-1]),
            "properties": propiedades
        })

    cur.close()
    conn.close()

    return {
        "type": "FeatureCollection",
        "features": features
    }


def obtener_mediciones(estacion_id):

    conn = obtener_conexion()
    cur = conn.cursor()

    cur.execute("""
        SELECT fecha, parametro, valor, unidad
        FROM mediciones_ambientales
        WHERE estacion_id = %s
        ORDER BY fecha;
    """, (estacion_id,))

    filas = cur.fetchall()

    mediciones = [
        {
            "fecha": str(fila[0]),
            "parametro": fila[1],
            "valor": float(fila[2]),
            "unidad": fila[3]
        }
        for fila in filas
    ]

    cur.close()
    conn.close()

    return mediciones