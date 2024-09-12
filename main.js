const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const { DateTime } = require("luxon");

class Unionex {
  constructor() {
    this.baseUrl = "https://prod-tg-app.midas.app/api"; // Updated base URL
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://prod-tg-app.midas.app",
      "Sec-Ch-Ua":
        '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
    };
  }

  log(msg, color = "white") {
    console.log(msg[color]);
  }

  async waitWithCountdown(seconds, msg = "continue") {
    const spinners = ["|", "/", "-", "\\"];
    let i = 0;
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let remainingSeconds = seconds % 60;
    for (let s = seconds; s >= 0; s--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(
        `${spinners[i]} Waiting ${hours}h ${minutes}m ${remainingSeconds}s to ${msg} ${spinners[i]}`
          .cyan
      );
      i = (i + 1) % spinners.length;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      remainingSeconds--;
      if (remainingSeconds < 0) {
        remainingSeconds = 59;
        minutes--;
        if (minutes < 0) {
          minutes = 59;
          hours--;
        }
      }
    }
    console.log("");
  }

  async auth(userData) {
    const url = `${this.baseUrl}/auth/telegram`;
    const headers = { ...this.headers, Webapp: "true" };

    try {
        console.log(`Requesting authentication with URL: ${url}?${userData}`);
        const response = await axios.get(`${url}?${userData}`, { headers });
        return response.data.token;
    } catch (error) {
        if (error.response) {
            this.log(`Authentication error: ${error.response.status} ${error.response.statusText}`, "red");
        } else if (error.request) {
            this.log(`No response received: ${error.message}`, "red");
        } else {
            this.log(`Request setup error: ${error.message}`, "red");
        }
        return null;
    }
  }

  async getProfile(token) {
    const url = `${this.baseUrl}/referrals/data`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      Webapp: "false, true",
    };

    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      this.log(`Error fetching profile: ${error.message}`, "red");
      return null;
    }
  }

  async checkInDaily(token) {
    const url = `${this.baseUrl}/daily-checkins`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      await axios.post(url, {}, { headers });
      this.log("Daily check-in successful!", "green");
    } catch (error) {
      this.log(`Daily check-in error: ${error.message}`, "red");
    }
  }

  async getTask(token) {
    const url = `${this.baseUrl}/hold/tasks`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      this.log(`Error fetching task state: ${error.message}`, "red");
      return null;
    }
  }

  async startTask(token, taskId, slug) {
    const url = `${this.baseUrl}/hold/tasks/${taskId}/start`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      origin: "https://prod-tg-app.midas.app",
    };
    try {
      await axios.post(url, {}, { headers });
      this.log(`Starting task ${slug}!`, "green");
    } catch (error) {
      this.log(`Error starting task: ${error.message}`, "red");
    }
  }

  async claimTask(token, taskId, slug, rewardAmount) {
    const url = `${this.baseUrl}/hold/tasks/${taskId}/claim`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      origin: "https://prod-tg-app.midas.app",
    };
    try {
      await axios.post(url, {}, { headers });
      this.log(
        `Task ${slug} complete, reward ${rewardAmount} diamonds!`,
        "green"
      );
    } catch (error) {
      this.log(`Error claiming task: ${error.message}`, "red");
    }
  }

  extractFirstName(userData) {
    try {
      const userPart = userData.match(/user=([^&]*)/)[1];
      const decodedUserPart = decodeURIComponent(userPart);
      const userObj = JSON.parse(decodedUserPart);
      return userObj.first_name || "Unknown";
    } catch (error) {
      this.log(`Error extracting first_name: ${error.message}`, "red");
      return "Unknown";
    }
  }

  calculateWaitTime(firstAccountFinishTime) {
    if (!firstAccountFinishTime) return null;

    const now = DateTime.now();
    const finishTime = DateTime.fromMillis(firstAccountFinishTime);
    const duration = finishTime.diff(now);

    return duration.as("milliseconds");
  }

  async main() {
    while (true) {
      const dataFile = path.join(__dirname, "data.txt");
      const users = (await fs.readFile(dataFile, "utf8")).split("\n").filter(Boolean);
      let firstAccountFinishTime = null;

      for (let i = 0; i < users.length; i++) {
        const userData = users[i];
        const firstName = this.extractFirstName(userData);
        console.log(`[ Account ${i + 1} | ${firstName} ]`);

        const token = await this.auth(userData);
        if (!token) continue;

        this.log(`Login successful!`, "green");

        const profile = await this.getProfile(token);
        if (!profile) continue;

        this.log(`Balance: ${profile.balance}`, "green");

        await this.checkInDaily(token);

        try {
          await this.handleDiamonds(token, i);
          await this.handleFarming(token);
          await this.handleTasks(token);
        } catch (error) {
          this.log(`Error handling account tasks: ${error.message}`, "red");
        }
      }

      const waitTime = this.calculateWaitTime(firstAccountFinishTime);
      if (waitTime && waitTime > 0) {
        await this.waitWithCountdown(Math.floor(waitTime / 1000));
      } else {
        this.log("No valid wait time, continuing loop immediately.", "yellow");
        await this.waitWithCountdown(5);
      }
    }
  }

  async handleDiamonds(token, accountIndex) {
    // Your diamond handling logic here
  }

  async handleFarming(token) {
    // Your farming handling logic here
  }

  async handleTasks(token) {
    // Your task handling logic here
  }
}

if (require.main === module) {
  const midas = new Midas();
  midas.main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
