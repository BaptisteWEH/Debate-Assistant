# 🎙️ Debate Assistant — AI Debate Coach & Evaluation System

> **Note :** Ce projet vitrine met en avant la conception et le déploiement d'un assistant intelligent basé sur le LLM pour l'analyse et l'entraînement au débat. 

---

## 📌 À propos du projet

**Debate Assistant** est une application web interactive conçue pour aider les utilisateurs à évaluer, analyser et améliorer leurs performances lors de débats oraux ou écrits. 

L'application permet d'uploader des enregistrements ou des transcriptions, de générer des retours personnalisés structurés selon des grilles d'évaluation (*rubrics*) et de converser en temps réel avec un coach IA spécialisé.

---

## 🛠️ Stack Technique & Compétences Clés

Ce projet m'a permis de concevoir une architecture complète, du développement du pipeline IA jusqu'au déploiement Cloud infrastructure.

### 🧠 Intelligence Artificielle & LLM
* **RAG (Retrieval-Augmented Generation) :** Mise en place d'un système RAG pour enrichir les réponses du modèle avec des contextes précis (grilles d'évaluation, règles de débat, références textuelles).
* **LangChain :** Utilisation de LangChain pour orchestrer les chaînes de prompts, gérer la mémoire de conversation (*session store*) et structurer la logique des agents.
* **Embeddings & Vector Store :** Indexation et recherche sémantique de documents pour alimenter le moteur de recommandation.

### ☁️ Cloud & Infrastructure (AWS)
* **AWS S3 :** Stockage sécurisé des fichiers audio, des transcriptions et des artefacts générés.
* **AWS EC2 :** Hébergement et déploiement du serveur applicatif sous Linux.
* **Nginx & systemd :** Configuration de Nginx en reverse proxy et gestion des services d'arrière-plan (`debatecoach.service`).

### 💻 Web Development (Fullstack)
* **Frontend :** Next.js (React), TypeScript, TailwindCSS (interface moderne avec gestion du Mode Sombre/Clair).
* **Backend :** Python (FastAPI / REST API) pour le traitement des requêtes RAG et la gestion des sessions.
* **Email Server :** Microservice Node.js/Express pour la gestion des notifications et tests e-mails.

---

## ✨ Fonctionnalités Principales

- 📤 **Upload & Analyse :** Soumission de discours ou débats pour analyse automatique.
- 📊 **Grille d'évaluation (Rubric) :** Évaluation basée sur des critères précis (argumentation, structure, réplique, éloquence).
- 💬 **Coach Virtuel Interactif :** Moteur de discussion en direct avec historique de session.
- 📜 **Historique des débats :** Suivi des scores et des feedbacks au fil du temps.

---

## 🏗️ Architecture du Projet

```text
Debate-Assistant/
├── backend/               # Serveur FastAPI, logique RAG & agents LangChain
│   ├── services/          # Services RAG, session_store, agent_service, file_store
│   └── main.py            # Endpoints API REST
├── frontend/              # Interface utilisateur Next.js (App Router)
│   └── src/app/           # Pages (upload, debate, history, rubric, result)
├── email-server/          # Service d'envoi d'e-mails (Node.js)
└── deploy/                # Fichiers de déploiement (AWS EC2, Nginx, Systemd)
