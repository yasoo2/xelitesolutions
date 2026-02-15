document.addEventListener('DOMContentLoaded', function() {
    // Smooth Scrolling for Navigation Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 50, // Adjust for header height if needed
                    behavior: 'smooth'
                });
            }
        });
    });

    // Highlight Sections on Hover (Example: Using data-hover-effect attribute)
    document.querySelectorAll('[data-hover-effect]').forEach(element => {
        element.addEventListener('mouseover', function() {
            this.classList.add('hovered'); // Add a class for styling on hover
        });

        element.addEventListener('mouseout', function() {
            this.classList.remove('hovered'); // Remove the class when mouse leaves
        });
    });

    // Confirmation Message on Answering Test Questions (Example: Using data-question attribute)
    document.querySelectorAll('[data-question]').forEach(button => {
        button.addEventListener('click', function() {
            const questionId = this.closest('[data-question-container]').dataset.questionContainer;
            const answer = this.dataset.answer;

            // Display Confirmation Message (You can customize this part)
            const confirmationMessage = document.createElement('div');
            confirmationMessage.classList.add('confirmation-message');
            confirmationMessage.textContent = `You answered question ${questionId} with: ${answer}.  This is just a demo.`;

            // Style the confirmation message
            confirmationMessage.style.position = 'fixed';
            confirmationMessage.style.top = '50%';
            confirmationMessage.style.left = '50%';
            confirmationMessage.style.transform = 'translate(-50%, -50%)';
            confirmationMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            confirmationMessage.style.color = 'white';
            confirmationMessage.style.padding = '20px';
            confirmationMessage.style.borderRadius = '5px';
            confirmationMessage.style.zIndex = '1000';
            confirmationMessage.style.opacity = '0'; // Initially hidden
            confirmationMessage.style.transition = 'opacity 0.3s ease-in-out';

            document.body.appendChild(confirmationMessage);

            // Fade in the message
            setTimeout(() => {
                confirmationMessage.style.opacity = '1';
            }, 10);

            // Fade out and remove the message after a delay
            setTimeout(() => {
                confirmationMessage.style.opacity = '0';
                setTimeout(() => {
                    document.body.removeChild(confirmationMessage);
                }, 300); // Wait for the fade-out animation
            }, 3000); // Display for 3 seconds

        });
    });
});